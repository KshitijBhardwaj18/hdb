import React from 'react';

const WizardLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className='min-h-screen bg-[#1D1E1F]'>
      {children}
    </div>
  );
};

export default WizardLayout;
