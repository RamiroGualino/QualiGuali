import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import { Dropzone } from '../src/components/Dropzone';

function makeFile(name, content = 'contents') {
  return new File([content], name, { type: 'text/plain' });
}

describe('Dropzone', () => {
  test('renders with no props without crashing', () => {
    render(<Dropzone />);
    expect(screen.getByTestId('dropzone-input')).toBeInTheDocument();
  });

  test('renders the given hint text', () => {
    render(<Dropzone hint="Drop your file here" />);
    expect(screen.getByText('Drop your file here')).toBeInTheDocument();
  });

  test('calls onFiles with the dropped file(s)', () => {
    const onFiles = vi.fn();
    render(<Dropzone onFiles={onFiles} multiple hint="Drop files" />);

    const file = makeFile('report.json');
    const dropzone = screen.getByText('Drop files').parentElement;

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    });

    expect(onFiles).toHaveBeenCalledTimes(1);
    const [receivedFiles] = onFiles.mock.calls[0];
    expect(receivedFiles).toHaveLength(1);
    expect(receivedFiles[0].name).toBe('report.json');
  });

  test('calls onFiles when a file is chosen via the hidden file input', async () => {
    const onFiles = vi.fn();
    const user = userEvent.setup();
    render(<Dropzone onFiles={onFiles} />);

    const file = makeFile('evidence.png');
    await user.upload(screen.getByTestId('dropzone-input'), file);

    expect(onFiles).toHaveBeenCalledTimes(1);
    const [receivedFiles] = onFiles.mock.calls[0];
    expect(receivedFiles).toHaveLength(1);
    expect(receivedFiles[0].name).toBe('evidence.png');
  });

  test('does not call onFiles when the drop has no files', () => {
    const onFiles = vi.fn();
    render(<Dropzone onFiles={onFiles} hint="Drop files" />);

    fireEvent.drop(screen.getByText('Drop files').parentElement, {
      dataTransfer: { files: [] },
    });

    expect(onFiles).not.toHaveBeenCalled();
  });
});
