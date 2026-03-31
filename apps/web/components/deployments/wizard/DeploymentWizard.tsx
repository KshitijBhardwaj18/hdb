'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useConfig, useCreateConfig, useUpdateConfig } from '@/hooks/use-deployment-config';
import { useDeploy } from '@/hooks/use-deployment';
import { mapConfigToForm, mapFormToConfig } from '@/lib/mappers/form-to-config';
import { STEP_SCHEMAS, stepServicesSchema } from '@/lib/validation/deployment-schemas';
import { fullConfigSchema } from '@/lib/validation/deployment-schemas';
import { HorizontalStepper } from './HorizontalStepper';
import { StepBasicInfo } from './steps/StepBasicInfo';
import { StepCloudSetup } from './steps/StepCloudSetup';
import { StepNetwork } from './steps/StepNetwork';
import { StepCluster } from './steps/StepCluster';
import { StepAddons } from './steps/StepAddons';
import { StepReview } from './steps/StepReview';
import { DEFAULT_FORM_DATA, WIZARD_STEPS } from './types';
import type { DeploymentFormData } from './types';

const DRAFT_KEY = 'hydradb-wizard-draft';

function loadDraft(): Partial<DeploymentFormData> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(data: DeploymentFormData) {
  try {
    const { atlasClientSecret, mongoDbPassword, kafkaPassword, ...safeDraft } = data;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(safeDraft));
  } catch {
    // storage full or unavailable
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

// Fields for each step (used for per-step validation)
const STEP_FIELDS: Record<number, (keyof DeploymentFormData)[]> = {
  1: ['customerId', 'environment', 'domainName'],
  2: ['awsRegion', 'availabilityZones', 'roleArn', 'externalId', 'awsConnectionVerified'],
  3: ['vpcCidr', 'natGatewayStrategy'],
  4: ['kubernetesVersion'],
  5: ['mongoDbMode', 'atlasClientId', 'atlasClientSecret', 'atlasOrgId', 'atlasProjectName', 'mongoDbTier', 'mongoDbUsername', 'mongoDbPassword', 'atlasProjectId', 'atlasClusterName', 'atlasClusterRegion', 'kafkaSource', 'kafkaBootstrapServers', 'kafkaAuthType', 'kafkaUsername', 'kafkaPassword'],
};

export function DeploymentWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editCustomerId = searchParams.get('customerId');

  const [currentStep, setCurrentStep] = useState(1);
  const [isDeploying, setIsDeploying] = useState(false);
  const [showDeployConfirm, setShowDeployConfirm] = useState(false);

  const methods = useForm<DeploymentFormData>({
    defaultValues: DEFAULT_FORM_DATA,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(fullConfigSchema) as any,
    mode: 'onTouched',
  });

  const { handleSubmit, trigger, reset, watch, getValues } = methods;

  // Load existing config when editing
  const { data: existingConfig, isSuccess: configLoaded } = useConfig(editCustomerId);

  useEffect(() => {
    if (configLoaded && existingConfig) {
      const formValues = mapConfigToForm(existingConfig);
      reset({ ...DEFAULT_FORM_DATA, ...formValues });
    }
  }, [configLoaded, existingConfig, reset]);

  // Load draft from localStorage (only if not editing existing config)
  useEffect(() => {
    if (editCustomerId) return;
    const draft = loadDraft();
    if (draft) {
      reset({ ...DEFAULT_FORM_DATA, ...draft });
    }
  }, [editCustomerId, reset]);

  // Auto-save draft (debounced)
  const saveTimerRef = useRef<NodeJS.Timeout>(null);
  useEffect(() => {
    const subscription = watch((formData) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveDraft(formData as DeploymentFormData);
      }, 1000);
    });
    return () => {
      subscription.unsubscribe();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [watch]);

  // Mutations
  const createConfig = useCreateConfig();
  const updateConfig = useUpdateConfig();
  const deploy = useDeploy();
  const atlasHasWarnings = watch('atlasHasWarnings');

  const validateServicesFields = useCallback(() => {
    const data = getValues();
    const serviceFields = {
      mongoDbMode: data.mongoDbMode,
      atlasClientId: data.atlasClientId,
      atlasClientSecret: data.atlasClientSecret,
      atlasOrgId: data.atlasOrgId,
      atlasProjectName: data.atlasProjectName,
      mongoDbTier: data.mongoDbTier,
      mongoDbUsername: data.mongoDbUsername,
      mongoDbPassword: data.mongoDbPassword,
      atlasProjectId: data.atlasProjectId,
      atlasClusterName: data.atlasClusterName,
      atlasClusterRegion: data.atlasClusterRegion,
      kafkaSource: data.kafkaSource,
      kafkaBootstrapServers: data.kafkaBootstrapServers,
      kafkaAuthType: data.kafkaAuthType,
      kafkaUsername: data.kafkaUsername,
      kafkaPassword: data.kafkaPassword,
    };
    const result = stepServicesSchema.safeParse(serviceFields);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path[0] as keyof DeploymentFormData;
        if (path) {
          methods.setError(path, { type: 'manual', message: issue.message });
        }
      }
      return false;
    }
    return true;
  }, [getValues, methods]);

  const validateCurrentStep = useCallback(async () => {
    // Step 5 uses discriminated union — validate with schema directly
    if (currentStep === 5) {
      return validateServicesFields();
    }

    const fields = STEP_FIELDS[currentStep];
    if (!fields) return true;
    return trigger(fields);
  }, [currentStep, trigger, validateServicesFields]);

  const handleNext = async () => {
    const valid = await validateCurrentStep();
    if (!valid) {
      toast.error('Please fix the errors before continuing.');
      return;
    }
    if (currentStep < WIZARD_STEPS.length) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
    } else {
      router.push('/dashboard');
    }
  };

  const handleDeploy = async (data: DeploymentFormData) => {
    setIsDeploying(true);
    try {
      const config = mapFormToConfig(data);

      // Create or update config first
      try {
        if (editCustomerId) {
          await updateConfig.mutateAsync({ customerId: editCustomerId, input: config });
        } else {
          await createConfig.mutateAsync(config);
        }
      } catch (configErr) {
        const msg = configErr instanceof Error ? configErr.message : '';
        if (msg.includes('already exists') || msg.includes('CONFIG_EXISTS') || msg.includes('QUOTA_EXCEEDED')) {
          await updateConfig.mutateAsync({ customerId: data.customerId, input: config });
        } else {
          throw configErr;
        }
      }

      // Then trigger deployment
      await deploy.mutateAsync({
        customerId: data.customerId,
        request: { environment: data.environment },
      });

      clearDraft();
      router.push(
        `/deployments/progress?customerId=${encodeURIComponent(data.customerId)}&environment=${encodeURIComponent(data.environment)}`,
      );
    } catch (err) {
      setIsDeploying(false);
      const message = err instanceof Error ? err.message : 'Deployment failed';
      toast.error(message);
    }
  };

  const isLastStep = currentStep === WIZARD_STEPS.length;

  return (
    <FormProvider {...methods}>
      <div className='flex min-h-screen flex-col'>
        {/* Header */}
        <div
          className='flex items-center justify-between px-8 py-5'
          style={{ borderBottom: '0.5px solid #5B5B5B' }}
        >
          <div className='flex flex-col gap-0.5'>
            <h1
              className='text-2xl font-semibold text-white'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              {editCustomerId ? 'Edit Deployment' : 'Create Deployment'}
            </h1>
            <p
              className='text-sm text-[#A7A7A7]'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              {editCustomerId ? 'Review and update your deployment configuration' : 'Configure your cloud deployment settings'}
            </p>
          </div>
          <span
            className='text-lg font-medium text-[#FF4400]'
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Step {currentStep} of {WIZARD_STEPS.length}
          </span>
        </div>

        {/* Stepper */}
        <div className='px-8 pt-8 pb-4'>
          <HorizontalStepper currentStep={currentStep} />
        </div>

        {/* Step Content */}
        <div className='flex-1 overflow-y-auto px-8 py-4'>
          <div className='mx-auto max-w-[800px]'>
            {renderStep()}
          </div>
        </div>

        {/* Footer */}
        <div
          className='flex items-center justify-between px-8 py-4'
          style={{ borderTop: '0.5px solid #5B5B5B' }}
        >
          <button
            type='button'
            onClick={handleBack}
            className='flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90'
            style={{ border: '0.67px solid #A7A7A7', fontFamily: 'Satoshi, sans-serif' }}
          >
            <ArrowLeft className='h-4 w-4' />
            Back
          </button>

          <div className='flex items-center gap-3'>
            {isLastStep ? (
              <button
                type='button'
                onClick={() => {
                  // Run strict discriminated-union validation for services fields
                  if (!validateServicesFields()) {
                    toast.error('Please fix the Services configuration before deploying.');
                    return;
                  }
                  // Then run full form validation via resolver
                  handleSubmit(
                    () => setShowDeployConfirm(true),
                    (errors) => {
                      const firstError = Object.values(errors)[0];
                      const msg = firstError?.message || firstError?.root?.message || 'Please fix form errors before deploying.';
                      toast.error(typeof msg === 'string' ? msg : 'Please fix form errors before deploying.');
                    },
                  )();
                }}
                disabled={isDeploying || atlasHasWarnings}
                className='flex items-center gap-2 rounded-lg bg-[#FF4400] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00] disabled:opacity-60'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                {isDeploying ? 'Deploying...' : 'Deploy'}
                <ArrowRight className='h-4 w-4' />
              </button>
            ) : (
              <button
                type='button'
                onClick={handleNext}
                className='flex items-center gap-2 rounded-lg bg-[#FF4400] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                Next
                <ArrowRight className='h-4 w-4' />
              </button>
            )}
          </div>
        </div>
      </div>
      {showDeployConfirm && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'>
          <div className='flex w-full max-w-[440px] flex-col gap-5 rounded-lg bg-[#222222] p-6' style={{ border: '0.5px solid #5B5B5B' }}>
            <div className='flex flex-col gap-2'>
              <h3 className='text-lg font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                Confirm Deployment
              </h3>
              <p className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                This will create infrastructure in your AWS account. The process takes 30-40 minutes and will incur AWS charges.
              </p>
            </div>
            <div className='flex items-center justify-end gap-3'>
              <button
                onClick={() => setShowDeployConfirm(false)}
                className='rounded-lg px-4 py-2 text-sm font-medium text-[#A7A7A7] transition-colors hover:text-white'
                style={{ border: '0.67px solid #5B5B5B', fontFamily: 'Satoshi, sans-serif' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowDeployConfirm(false); handleSubmit(handleDeploy)(); }}
                disabled={isDeploying}
                className='rounded-lg bg-[#FF4400] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#E63D00] disabled:opacity-60'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                {isDeploying ? 'Deploying...' : 'Yes, Deploy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FormProvider>
  );

  function renderStep() {
    switch (currentStep) {
      case 1:
        return <StepBasicInfo />;
      case 2:
        return <StepCloudSetup />;
      case 3:
        return <StepNetwork />;
      case 4:
        return <StepCluster />;
      case 5:
        return <StepAddons />;
      case 6:
        return <StepReview />;
      default:
        return null;
    }
  }
}
