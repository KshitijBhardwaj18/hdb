import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
