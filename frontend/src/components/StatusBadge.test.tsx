import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DocumentStatus } from '../api/types';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it.each<[DocumentStatus, string]>([
    ['PENDING', 'Pending'],
    ['PROCESSING', 'Processing'],
    ['COMPLETED', 'Completed'],
    ['FAILED', 'Failed'],
  ])('shows %s as the text "%s", so status is never conveyed by color alone', (status, label) => {
    render(<StatusBadge status={status} />);

    expect(screen.getByText(label)).toBeTruthy();
  });

  it('hides its decorative icon from assistive technology', () => {
    const { container } = render(<StatusBadge status="FAILED" />);

    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
