# Turborepo starter Heizen.

This Turborepo starter is maintained by the Turborepo core team.

## Using this example

Run the following command:

```sh
npx create-turbo@latest
```

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `docs`: a [Next.js](https://nextjs.org/) app
- `web`: another [Next.js](https://nextjs.org/) app with a sample ContactForm component using shadcn/ui
- `@repo/ui`: a React component library with shadcn/ui components shared by applications
- `@repo/eslint-config`: `eslint` configurations (includes `eslint-config-next` and `eslint-config-prettier`)
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

### Build

To build all apps and packages, run the following command:

```
cd my-turborepo
pnpm build
```

### Develop

To develop all apps and packages, run the following command:

```
cd my-turborepo
pnpm dev
```

### Testing

This project includes unit tests for UI components using Jest and React Testing Library.

#### Running Tests

To run tests for the web application:

```bash
# Navigate to the web app directory
cd apps/web

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test --coverage
```

#### Test Structure

- Tests are located in `apps/web/__tests__/` directory
- The project includes comprehensive tests for the ContactForm component
- Tests cover form validation, user interactions, loading states, and accessibility

#### Example Component

The web app includes a `ContactForm` component built with shadcn/ui that demonstrates:

- Form validation with custom error messages
- Integration with shadcn/ui components (Button, Input, Label, Textarea, Card)
- TypeScript interfaces for type safety
- Comprehensive unit test coverage

The ContactForm component can be found at `apps/web/components/ContactForm.tsx` with its tests at
`apps/web/__tests__/ContactForm.test.tsx`.

### Remote Caching

> [!TIP] Vercel Remote Cache is free for all plans. Get started today at
> [vercel.com](https://vercel.com/signup?/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching) to
share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't
have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following
commands:

```
cd my-turborepo
npx turbo login
```

This will authenticate the Turborepo CLI with your
[Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

```
npx turbo link
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turborepo.com/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.com/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.com/docs/reference/configuration)
- [CLI Usage](https://turborepo.com/docs/reference/command-line-reference)

# CASL Authorization Module

A minimal, type-safe implementation of CASL (Code Access Security Layer) for this NestJS template.

## Overview

This CASL implementation enhances the existing system with ability-based access control. It provides:

- Type-safe permission checks using CASL abilities
- Simple permission format: `resource:action`
- Integration with existing Prisma models
- Easy-to-understand decorators and guards

## Quick Start

### 1. Define Permissions in Database

Permissions are stored in the `RolePermission.permissions` array field as strings:

```typescript
// Example permissions format:
[
  'chat:read', // Can read chats
  'chat:create', // Can create chats
  'chat:update', // Can update chats
  'chat:delete', // Can delete chats
  'chat:manage', // Can do everything with chats
  'all:manage', // Admin - can do everything
];
```

### 2. Use in Controllers

Apply the `AbilitiesGuard` and `@CheckAbilities` decorator:

```typescript
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AbilitiesGuard } from '../casl/guards/abilities.guard';
import { CheckAbilities } from '../casl/decorators/check-abilities.decorator';

@Controller('chats')
@UseGuards(JwtAuthGuard) // Authenticate first
export class ChatController {
  @Get()
  @UseGuards(AbilitiesGuard)
  @CheckAbilities({ action: 'read', subject: 'Chat' })
  async findAll() {
    // Only users with "chat:read" or "chat:manage" permission can access
  }

  @Post()
  @UseGuards(AbilitiesGuard)
  @CheckAbilities({ action: 'create', subject: 'Chat' })
  async create() {
    // Only users with "chat:create" or "chat:manage" permission can access
  }

  @Put(':id')
  @UseGuards(AbilitiesGuard)
  @CheckAbilities({ action: 'update', subject: 'Chat' })
  async update() {
    // Only users with "chat:update" or "chat:manage" permission can access
  }
}
```

### 3. Check Multiple Abilities

You can require multiple abilities for a single endpoint:

```typescript
@Get('admin/users')
@UseGuards(AbilitiesGuard)
@CheckAbilities(
  { action: 'read', subject: 'User' },
  { action: 'manage', subject: 'all' }
)
async adminUsers() {
  // User must have BOTH "user:read" AND "all:manage" permissions
}
```

## Permission Format

### Actions

Available actions (defined in `casl-ability.factory.ts`):

- `create` - Create new resources
- `read` - View/read resources
- `update` - Modify existing resources
- `delete` - Remove resources
- `manage` - All actions on a resource

### Subjects

Available subjects (defined in `casl-ability.factory.ts`):

- `Chat` - Chat resources
- `User` - User resources
- `all` - All resources (admin)

### Adding New Subjects

1. Add the new subject to the `Subjects` type in `casl-ability.factory.ts`:

```typescript
export type Subjects = 'Chat' | 'User' | 'Post' | 'all';
//                                        ^^^^^ new subject
```

2. Update the validation method:

```typescript
private isValidSubject(subject: string): subject is Subjects {
  return ['Chat', 'User', 'Post', 'all'].includes(subject);
  //                       ^^^^^^ add here
}
```

3. Use in your controller:

```typescript
@CheckAbilities({ action: 'read', subject: 'Post' })
```

4. Add permission to database:

```sql
UPDATE role_permissions
SET permissions = array_append(permissions, 'post:read')
WHERE role = 'USER';
```

## Advanced Usage

### Using Ability Directly in Services

Inject the ability into your service method using `@CurrentAbility()`:

```typescript
import { CurrentAbility } from '../casl/decorators/current-ability.decorator';
import { AppAbility } from '../casl/casl-ability.factory';

@Get()
@UseGuards(AbilitiesGuard)
async findAll(@CurrentAbility() ability: AppAbility) {
  // Manually check abilities in your controller/service logic
  if (ability.can('read', 'Chat')) {
    // Do something
  }
}
```
