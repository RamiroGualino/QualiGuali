import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { ExpectationSelector } from '../src/components/ExpectationSelector';

beforeAll(() => i18n.changeLanguage('en'));

// Etapa 6.2: `columns` pasa de string[] a [{name, tipoDato}] — sin tipoDato
// definido acá a propósito, para no filtrar el catálogo en los tests que no
// se ocupan específicamente de eso (ver ExpectationSelector.typeFilter.test.jsx).
const COLUMNS = [
  { name: 'nombre', tipoDato: 'sin_definir' },
  { name: 'edad', tipoDato: 'sin_definir' },
  { name: 'email', tipoDato: 'sin_definir' },
];
const COLUMN_NAMES = COLUMNS.map((column) => column.name);

// Etapa 6.1: ExpectationSelector ya no es un componente value/onChange sobre
// el array completo — sólo arma UNA expectativa a la vez y la entrega vía
// onSubmit (el padre decide si la agrega o reemplaza una existente).
// `activeTab` también pasó a ser controlado desde afuera (el padre real,
// ExpectationSuiteFormPage, lo necesita para filtrar ExpectationList) — el
// harness le da un dueño mínimo (useState) para que los clicks en las
// pestañas sigan funcionando en los tests.
function Harness({ initialActiveTab = 'table', ...rest }) {
  const [activeTab, setActiveTab] = useState(initialActiveTab);
  return (
    <ExpectationSelector
      columns={COLUMNS}
      onSubmit={vi.fn()}
      onCancelEdit={vi.fn()}
      {...rest}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}

async function selectColumnTab(user) {
  await user.click(screen.getByRole('tab', { name: 'Column' }));
}

describe('ExpectationSelector', () => {
  test('elegir "Between X and Y" en Columna muestra 2 inputs numéricos (min, max)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await selectColumnTab(user);

    await user.selectOptions(screen.getByLabelText('Column'), 'edad');
    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-012');

    expect(screen.getByLabelText('Minimum')).toBeInTheDocument();
    expect(screen.getByLabelText('Maximum')).toBeInTheDocument();
  });

  test('elegir "Is in the set" muestra el Tag Input de valores', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await selectColumnTab(user);

    await user.selectOptions(screen.getByLabelText('Column'), 'edad');
    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-013');

    expect(screen.getByLabelText('Values (comma-separated)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Minimum')).not.toBeInTheDocument();
  });

  test('elegir "Not null" no muestra ningún input adicional', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await selectColumnTab(user);

    await user.selectOptions(screen.getByLabelText('Column'), 'edad');
    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-007');

    expect(screen.queryByLabelText('Minimum')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Values (comma-separated)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add expectation' })).toBeEnabled();
  });

  test('elegir "Parseable as date" no muestra ningún input adicional', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await selectColumnTab(user);

    await user.selectOptions(screen.getByLabelText('Column'), 'edad');
    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-021');

    expect(screen.getByRole('button', { name: 'Add expectation' })).toBeEnabled();
    expect(screen.queryByLabelText('Pattern (regex)')).not.toBeInTheDocument();
  });

  test('cambiar de tipo sin agregar el anterior reemplaza los inputs, no los acumula', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await selectColumnTab(user);
    await user.selectOptions(screen.getByLabelText('Column'), 'edad');

    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-012');
    await user.type(screen.getByLabelText('Minimum'), '10');
    expect(screen.getByLabelText('Minimum')).toHaveValue(10);

    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-013');
    expect(screen.queryByLabelText('Minimum')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-012');
    expect(screen.getByLabelText('Minimum')).toHaveValue(null);
  });

  test('agregar una expectativa llama a onSubmit con el shape correcto y limpia el formulario', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await selectColumnTab(user);

    await user.selectOptions(screen.getByLabelText('Column'), 'edad');
    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-007');
    await user.click(screen.getByRole('button', { name: 'Add expectation' }));

    expect(onSubmit).toHaveBeenCalledWith({
      expId: 'EXP-DT-007',
      scope: 'column',
      column: 'edad',
      params: {},
      threshold: 100,
    });
    // Se queda en la misma columna/tab (para agregar varias reglas
    // seguidas), pero el tipo elegido se limpia.
    expect(screen.getByLabelText('Expectation type')).toHaveValue('');
    expect(screen.getByLabelText('Column')).toHaveValue('edad');
  });

  test('pestaña Tabla: "Columns = exact list, in order" muestra el Tag Input, sin campo de Umbral', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-005');

    expect(
      screen.getByLabelText('Columns (one per line, in the expected order)'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Threshold (%)')).not.toBeInTheDocument();
  });

  test('pestaña Multicolumna: "Column A > Column B" muestra el checkbox "Or equal" y permite elegir 2+ columnas', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('tab', { name: 'Multicolumn' }));

    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-032');
    expect(screen.getByText('Or equal')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Add expectation' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'nombre' }));
    await user.click(screen.getByRole('checkbox', { name: /edad/ }));
    expect(screen.getByRole('button', { name: 'Add expectation' })).toBeEnabled();
  });

  test('onSubmit recibe el shape exacto que espera ExpectationSuite.expectations, incluyendo listas via Tag Input', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await selectColumnTab(user);

    await user.selectOptions(screen.getByLabelText('Column'), 'edad');
    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-013');
    await user.type(screen.getByLabelText('Values (comma-separated)'), 'ACTIVO{Enter}BAJA{Enter}');
    await user.click(screen.getByRole('button', { name: 'Add expectation' }));

    expect(onSubmit).toHaveBeenCalledWith({
      expId: 'EXP-DT-013',
      scope: 'column',
      column: 'edad',
      params: { values: ['ACTIVO', 'BAJA'] },
      threshold: 100,
    });
  });

  test('Tabla: "Row count = X" precarga Count con el rowCount real del archivo de referencia', async () => {
    const user = userEvent.setup();
    render(<Harness rowCount={7} />);

    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-001');

    expect(screen.getByLabelText('Count')).toHaveValue(7);
  });

  test('Tabla: "Row count = X" sin rowCount conocido (null) arranca vacío', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-001');

    expect(screen.getByLabelText('Count')).toHaveValue(null);
  });

  test('Tabla: "Column count = X" precarga Count con la cantidad de columnas detectadas', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-003');

    expect(screen.getByLabelText('Count')).toHaveValue(COLUMNS.length);
  });

  test('Tabla: "Columns = exact list, in order" precarga la lista con las columnas detectadas', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-005');

    for (const columnName of COLUMN_NAMES) {
      expect(screen.getByRole('listitem', { name: columnName })).toBeInTheDocument();
    }
  });

  test('el valor precargado sigue siendo editable (se puede sacar con Backspace)', async () => {
    const user = userEvent.setup();
    render(<Harness rowCount={7} />);

    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-001');
    await user.clear(screen.getByLabelText('Count'));
    await user.type(screen.getByLabelText('Count'), '99');

    expect(screen.getByLabelText('Count')).toHaveValue(99);
  });

  test('previsualización en lenguaje natural se actualiza en vivo, con placeholder para lo que falta', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await selectColumnTab(user);
    await user.selectOptions(screen.getByLabelText('Column'), 'edad');
    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-012');

    expect(screen.getByText('✔ Will validate that edad: Between ___ and ___.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Minimum'), '18');
    expect(screen.getByText('✔ Will validate that edad: Between 18 and ___.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Maximum'), '65');
    expect(screen.getByText('✔ Will validate that edad: Between 18 and 65.')).toBeInTheDocument();
  });

  test('sin ningún tipo elegido todavía, no muestra la previsualización', () => {
    render(<Harness />);
    expect(screen.queryByText(/Will validate that/)).not.toBeInTheDocument();
  });

  describe('preseleccionar columna (click en pastilla de "Columnas detectadas")', () => {
    test('initialColumn arranca en la pestaña Columna, con esa columna elegida, y muestra el header de contexto', () => {
      render(<Harness initialActiveTab="column" initialColumn="edad" />);

      expect(screen.getByRole('tab', { name: 'Column', selected: true })).toBeInTheDocument();
      expect(screen.getByLabelText('Column')).toHaveValue('edad');
      expect(screen.getByText('Configuring rules for: edad')).toBeInTheDocument();
    });
  });

  describe('modo edición', () => {
    const EXISTING = {
      expId: 'EXP-DT-012',
      scope: 'column',
      column: 'edad',
      params: { min: 18, max: 65 },
      threshold: 90,
    };

    test('hidrata tab/columna/tipo/inputs/umbral desde initialExpectation', () => {
      render(
        <Harness
          initialActiveTab="column"
          initialColumn="edad"
          initialExpectation={EXISTING}
          isEditing
        />,
      );

      expect(screen.getByLabelText('Column')).toHaveValue('edad');
      expect(screen.getByLabelText('Expectation type')).toHaveValue('EXP-DT-012');
      expect(screen.getByLabelText('Minimum')).toHaveValue(18);
      expect(screen.getByLabelText('Maximum')).toHaveValue(65);
      expect(screen.getByLabelText('Threshold (%)')).toHaveValue(90);
    });

    test('el botón dice "Save changes" y aparece "Cancel" al lado', () => {
      render(
        <Harness
          initialActiveTab="column"
          initialColumn="edad"
          initialExpectation={EXISTING}
          isEditing
        />,
      );

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add expectation' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    test('"Save changes" llama a onSubmit con los valores editados', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <Harness
          initialActiveTab="column"
          initialColumn="edad"
          initialExpectation={EXISTING}
          isEditing
          onSubmit={onSubmit}
        />,
      );

      await user.clear(screen.getByLabelText('Maximum'));
      await user.type(screen.getByLabelText('Maximum'), '70');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(onSubmit).toHaveBeenCalledWith({
        expId: 'EXP-DT-012',
        scope: 'column',
        column: 'edad',
        params: { min: 18, max: 70 },
        threshold: 90,
      });
    });

    test('"Cancel" llama a onCancelEdit', async () => {
      const user = userEvent.setup();
      const onCancelEdit = vi.fn();
      render(
        <Harness
          initialActiveTab="column"
          initialColumn="edad"
          initialExpectation={EXISTING}
          isEditing
          onCancelEdit={onCancelEdit}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onCancelEdit).toHaveBeenCalled();
    });

    test('edita una expectativa con lista de valores (Tag Input) hidratado correctamente', () => {
      render(
        <Harness
          initialActiveTab="column"
          initialColumn="estado"
          initialExpectation={{
            expId: 'EXP-DT-013',
            scope: 'column',
            column: 'estado',
            params: { values: ['ACTIVO', 'BAJA'] },
            threshold: 100,
          }}
          isEditing
        />,
      );

      expect(screen.getByRole('listitem', { name: 'ACTIVO' })).toBeInTheDocument();
      expect(screen.getByRole('listitem', { name: 'BAJA' })).toBeInTheDocument();
    });
  });

  describe('Etapa 6.2 — filtro por tipo de dato', () => {
    const TYPED_COLUMNS = [
      { name: 'dni', tipoDato: 'sin_definir' },
      { name: 'edad', tipoDato: 'numero' },
      { name: 'nombre', tipoDato: 'texto' },
      { name: 'fecha_nacimiento', tipoDato: 'fecha' },
    ];

    test('columna sin tipo definido: el catálogo completo de 25 queda visible, sin filtrar', async () => {
      const user = userEvent.setup();
      render(<Harness columns={TYPED_COLUMNS} />);
      await selectColumnTab(user);
      await user.selectOptions(screen.getByLabelText('Column'), 'dni');

      expect(screen.getAllByRole('option').length).toBeGreaterThan(20);
      // Estadística (023-031) es un grupo exclusivo de Número/Fecha — con
      // "sin_definir" también tiene que estar completo.
      expect(screen.getByRole('option', { name: 'Sum between X and Y' })).toBeInTheDocument();
    });

    test('columna "numero": sólo universales + las de Número', async () => {
      const user = userEvent.setup();
      render(<Harness columns={TYPED_COLUMNS} />);
      await selectColumnTab(user);
      await user.selectOptions(screen.getByLabelText('Column'), 'edad');

      expect(screen.getByRole('option', { name: 'Between X and Y' })).toBeInTheDocument(); // universal-ish (num/fecha)
      expect(screen.getByRole('option', { name: 'Not null' })).toBeInTheDocument(); // universal
      expect(screen.getByRole('option', { name: 'Sum between X and Y' })).toBeInTheDocument(); // + número
      expect(screen.queryByRole('option', { name: 'Matches regex' })).not.toBeInTheDocument(); // sólo texto
      expect(screen.queryByRole('option', { name: 'Length = X' })).not.toBeInTheDocument(); // sólo texto
      expect(screen.queryByRole('option', { name: 'Parseable as date' })).not.toBeInTheDocument(); // sólo fecha
    });

    test('columna "texto": sólo universales + las de Texto', async () => {
      const user = userEvent.setup();
      render(<Harness columns={TYPED_COLUMNS} />);
      await selectColumnTab(user);
      await user.selectOptions(screen.getByLabelText('Column'), 'nombre');

      expect(screen.getByRole('option', { name: 'Length = X' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Matches regex' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Unique' })).toBeInTheDocument(); // universal
      expect(screen.queryByRole('option', { name: 'Sum between X and Y' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Between X and Y' })).not.toBeInTheDocument();
    });

    test('columna "fecha": sólo universales + las de Fecha (incluye Between X and Y)', async () => {
      const user = userEvent.setup();
      render(<Harness columns={TYPED_COLUMNS} />);
      await selectColumnTab(user);
      await user.selectOptions(screen.getByLabelText('Column'), 'fecha_nacimiento');

      expect(screen.getByRole('option', { name: 'Parseable as date' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Between X and Y' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Max between X and Y' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Length = X' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Sum between X and Y' })).not.toBeInTheDocument();
    });

    test('"View all expectations" (escape hatch) saltea el filtro sin restricción dura', async () => {
      const user = userEvent.setup();
      render(<Harness columns={TYPED_COLUMNS} />);
      await selectColumnTab(user);
      await user.selectOptions(screen.getByLabelText('Column'), 'nombre');

      expect(screen.queryByRole('option', { name: 'Sum between X and Y' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'View all expectations' }));

      expect(screen.getByRole('option', { name: 'Sum between X and Y' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Filter by data type' })).toBeInTheDocument();
    });

    test('el selector "Tipo de dato de esta columna" refleja y actualiza el tipoDato de la columna', async () => {
      const user = userEvent.setup();
      const onColumnTypeChange = vi.fn();
      render(<Harness columns={TYPED_COLUMNS} onColumnTypeChange={onColumnTypeChange} />);
      await selectColumnTab(user);
      await user.selectOptions(screen.getByLabelText('Column'), 'edad');

      expect(screen.getByLabelText("This column's data type")).toHaveValue('numero');

      await user.selectOptions(screen.getByLabelText("This column's data type"), 'texto');

      expect(onColumnTypeChange).toHaveBeenCalledWith('edad', 'texto');
    });

    test('EXP-DT-010 ("Tipo de dato (uno)") con columna de tipo conocido: no vuelve a preguntar (el selector "Data type" no se muestra)', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<Harness columns={TYPED_COLUMNS} onSubmit={onSubmit} />);
      await selectColumnTab(user);
      await user.selectOptions(screen.getByLabelText('Column'), 'edad'); // tipoDato: numero
      await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-010');

      // El segundo selector de tipo (redundante con "This column's data
      // type", ya mostrado arriba) no se renderiza en absoluto.
      expect(screen.queryByLabelText('Data type')).not.toBeInTheDocument();
      // Pero el valor precargado ('number', mapeado de tipoDato: numero) se
      // sigue mandando igual al submitear — se verifica vía la
      // previsualización, ya que no hay ningún input visible para leerlo.
      expect(screen.getByText(/Data type: Number/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Add expectation' }));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ expId: 'EXP-DT-010', params: { type: 'number' } }),
      );
    });

    test('EXP-DT-011 ("Tipo de dato en lista") precarga el tipo de la columna ya tildado, se puede sumar más', async () => {
      const user = userEvent.setup();
      render(<Harness columns={TYPED_COLUMNS} />);
      await selectColumnTab(user);
      await user.selectOptions(screen.getByLabelText('Column'), 'fecha_nacimiento'); // tipoDato: fecha
      await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-011');

      expect(screen.getByRole('checkbox', { name: 'Date' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Number' })).not.toBeChecked();
    });

    test('columna sin tipo definido: EXP-DT-010 no precarga nada (default "Text" de siempre)', async () => {
      const user = userEvent.setup();
      render(<Harness columns={TYPED_COLUMNS} />);
      await selectColumnTab(user);
      await user.selectOptions(screen.getByLabelText('Column'), 'dni'); // tipoDato: sin_definir
      await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-010');

      expect(screen.getByLabelText('Data type')).toHaveValue('text');
    });

    test('cambiar de columna resetea el tipo de expectativa elegido (evita uno fuera del nuevo filtro)', async () => {
      const user = userEvent.setup();
      render(<Harness columns={TYPED_COLUMNS} />);
      await selectColumnTab(user);
      await user.selectOptions(screen.getByLabelText('Column'), 'edad');
      await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-031'); // Sum, sólo número

      await user.selectOptions(screen.getByLabelText('Column'), 'nombre');

      expect(screen.getByLabelText('Expectation type')).toHaveValue('');
    });

    test('Multicolumna: una columna de tipo distinto a la primera elegida se des-prioriza, no se oculta', async () => {
      const user = userEvent.setup();
      render(<Harness columns={TYPED_COLUMNS} />);
      await user.click(screen.getByRole('tab', { name: 'Multicolumn' }));

      await user.click(screen.getByRole('checkbox', { name: /^edad/ })); // numero

      const nombreCheckbox = screen.getByRole('checkbox', { name: /^nombre/ }); // texto — sigue elegible
      expect(nombreCheckbox).toBeInTheDocument();
      expect(nombreCheckbox).not.toBeDisabled();
      await user.click(nombreCheckbox);
      expect(nombreCheckbox).toBeChecked();
    });
  });
});
