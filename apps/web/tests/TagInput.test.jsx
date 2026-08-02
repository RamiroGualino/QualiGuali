import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { TagInput } from '../src/components/TagInput';

beforeAll(() => i18n.changeLanguage('en'));

function Harness({ onExpose }) {
  const [value, setValue] = useState([]);
  if (onExpose) onExpose(value);
  return <TagInput label="Values" value={value} onChange={setValue} placeholder="Type a value" />;
}

describe('TagInput', () => {
  test('Enter convierte el texto tipeado en una pastilla y limpia el input', async () => {
    const user = userEvent.setup();
    let exposed = [];
    render(<Harness onExpose={(v) => (exposed = v)} />);

    await user.type(screen.getByLabelText('Values'), 'ACTIVO{Enter}');

    expect(screen.getByRole('listitem', { name: /ACTIVO/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Values')).toHaveValue('');
    expect(exposed).toEqual(['ACTIVO']);
  });

  test('permite agregar varias pastillas seguidas', async () => {
    const user = userEvent.setup();
    let exposed = [];
    render(<Harness onExpose={(v) => (exposed = v)} />);

    await user.type(screen.getByLabelText('Values'), 'ACTIVO{Enter}BAJA{Enter}SUSPENDIDO{Enter}');

    expect(exposed).toEqual(['ACTIVO', 'BAJA', 'SUSPENDIDO']);
  });

  test('Backspace con el input vacío quita la última pastilla', async () => {
    const user = userEvent.setup();
    let exposed = [];
    render(<Harness onExpose={(v) => (exposed = v)} />);

    await user.type(screen.getByLabelText('Values'), 'ACTIVO{Enter}BAJA{Enter}');
    await user.type(screen.getByLabelText('Values'), '{Backspace}');

    expect(exposed).toEqual(['ACTIVO']);
  });

  test('el botón Remove de una pastilla la saca del estado', async () => {
    const user = userEvent.setup();
    let exposed = [];
    render(<Harness onExpose={(v) => (exposed = v)} />);
    await user.type(screen.getByLabelText('Values'), 'ACTIVO{Enter}');

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(exposed).toEqual([]);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  test('un espacio en blanco solo no agrega una pastilla vacía', async () => {
    const user = userEvent.setup();
    let exposed = [];
    render(<Harness onExpose={(v) => (exposed = v)} />);

    await user.type(screen.getByLabelText('Values'), '   {Enter}');

    expect(exposed).toEqual([]);
  });

  test('perder el foco también confirma el texto tipeado (no se pierde)', async () => {
    const user = userEvent.setup();
    let exposed = [];
    render(
      <div>
        <Harness onExpose={(v) => (exposed = v)} />
        <button type="button">Elsewhere</button>
      </div>,
    );

    await user.type(screen.getByLabelText('Values'), 'ACTIVO');
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));

    expect(exposed).toEqual(['ACTIVO']);
  });
});
