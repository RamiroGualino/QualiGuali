import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { TestCaseForm } from '../src/components/TestCaseForm';

// Force a deterministic language regardless of the test environment's
// navigator.language, so label text assertions below aren't flaky.
beforeAll(() => i18n.changeLanguage('en'));

const templates = [
  {
    _id: 'tmpl-1',
    name: 'Default',
    fields: [
      { key: 'browser', label: 'Browser', type: 'text', required: true },
      { key: 'retries', label: 'Retries', type: 'number', required: false },
      { key: 'automated', label: 'Automated', type: 'boolean', required: false },
      {
        key: 'env',
        label: 'Environment',
        type: 'select',
        required: true,
        options: ['qa', 'staging'],
      },
    ],
  },
  {
    _id: 'tmpl-2',
    name: 'Minimal',
    fields: [],
  },
];

const requirements = [
  { _id: 'req-1', code: 'REQ-001', title: 'Login' },
  { _id: 'req-2', code: 'REQ-002', title: 'Checkout' },
];

const testSuites = [
  { _id: 'suite-1', name: 'Login happy path', requirementId: 'req-1' },
  { _id: 'suite-2', name: 'Login edge cases', requirementId: 'req-1' },
  { _id: 'suite-3', name: 'Checkout flow', requirementId: 'req-2' },
];

describe('TestCaseForm', () => {
  test('renders with no templates without crashing', () => {
    render(<TestCaseForm />);
    expect(screen.getByTestId('test-case-form')).toBeInTheDocument();
  });

  test('renders one dynamic field per template field for the selected template', () => {
    render(<TestCaseForm templates={templates} />);

    expect(screen.getByLabelText(/^Browser/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Retries/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Automated/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Environment/)).toBeInTheDocument();
  });

  test('swapping templates swaps the rendered dynamic fields', async () => {
    const user = userEvent.setup();
    render(<TestCaseForm templates={templates} />);

    expect(screen.getByLabelText(/^Browser/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/template/i), 'tmpl-2');

    expect(screen.queryByLabelText(/^Browser/)).not.toBeInTheDocument();
  });

  test('submits title, steps and the dynamic customFields values', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    render(<TestCaseForm templates={templates} onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/title/i), 'Login works');
    await user.type(screen.getByLabelText(/^Browser/), 'chrome');
    await user.selectOptions(screen.getByLabelText(/^Environment/), 'qa');
    await user.click(screen.getByLabelText(/^Automated/));

    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Login works',
        templateId: 'tmpl-1',
        customFields: expect.objectContaining({
          browser: 'chrome',
          env: 'qa',
          automated: true,
        }),
      }),
    );
  });

  test('only offers suites for the selected requirement, and submits the chosen suiteId', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <TestCaseForm
        templates={templates}
        requirements={requirements}
        testSuites={testSuites}
        onSubmit={handleSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/title/i), 'Pay with credit card');
    await user.selectOptions(screen.getByLabelText(/^Requirements/), 'req-2');

    const suiteSelect = screen.getByLabelText(/^Test suites/);
    expect(screen.queryByRole('option', { name: 'Login happy path' })).not.toBeInTheDocument();
    await user.selectOptions(suiteSelect, 'suite-3');

    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(handleSubmit).toHaveBeenCalledWith(expect.objectContaining({ suiteId: 'suite-3' }));
  });

  test('resets the chosen suite when the requirement changes', async () => {
    const user = userEvent.setup();
    render(<TestCaseForm requirements={requirements} testSuites={testSuites} />);

    await user.selectOptions(screen.getByLabelText(/^Requirements/), 'req-1');
    await user.selectOptions(screen.getByLabelText(/^Test suites/), 'suite-1');
    expect(screen.getByLabelText(/^Test suites/)).toHaveValue('suite-1');

    await user.selectOptions(screen.getByLabelText(/^Requirements/), 'req-2');
    expect(screen.getByLabelText(/^Test suites/)).toHaveValue('');
  });
});
