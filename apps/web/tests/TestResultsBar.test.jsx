import { render, screen } from '@testing-library/react';
import { describe, test, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { TestResultsBar } from '../src/components/TestResultsBar';

beforeAll(() => i18n.changeLanguage('en'));

describe('TestResultsBar', () => {
  test('renders the passed/failed counts', () => {
    render(<TestResultsBar passed={8} failed={2} broken={0} skipped={0} total={10} />);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('folds broken tests into the failed count', () => {
    render(<TestResultsBar passed={5} failed={1} broken={2} skipped={0} total={8} />);
    // failed (1) + broken (2) = 3, shown as a single combined count.
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('shows the skipped count only when there are skipped tests', () => {
    const { rerender } = render(
      <TestResultsBar passed={5} failed={0} broken={0} skipped={0} total={5} />,
    );
    expect(screen.queryByText(/skipped/)).not.toBeInTheDocument();

    rerender(<TestResultsBar passed={4} failed={0} broken={0} skipped={2} total={6} />);
    expect(screen.getByText(/skipped/i)).toBeInTheDocument();
  });

  test('does not throw for an all-zero run', () => {
    render(<TestResultsBar passed={0} failed={0} broken={0} skipped={0} total={0} />);
    expect(screen.getAllByText('0')).toHaveLength(2);
  });

  test('exposes an accessible label summarizing the result', () => {
    render(<TestResultsBar passed={8} failed={2} broken={0} skipped={1} total={11} />);
    expect(screen.getByRole('img', { name: /8 passed, 2 failed, 1 skipped/i })).toBeInTheDocument();
  });
});
