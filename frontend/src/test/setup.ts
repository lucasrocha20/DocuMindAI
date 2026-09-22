import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only auto-cleans when the test runner exposes globals.
afterEach(cleanup);
