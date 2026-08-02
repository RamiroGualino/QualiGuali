import { render, screen } from '@testing-library/react';
import { describe, test, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { ImpactIndicator } from '../src/components/ImpactIndicator';

beforeAll(() => i18n.changeLanguage('en'));

describe('ImpactIndicator', () => {
  test('sin total conocido, muestra un guión', () => {
    render(<ImpactIndicator affected={2} total={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  test('calcula el porcentaje y el detalle "X of Y records"', () => {
    render(<ImpactIndicator affected={2} total={60} />);
    expect(screen.getByText('3.33%')).toBeInTheDocument();
    expect(screen.getByText('2 of 60 records')).toBeInTheDocument();
  });

  test('0 afectados de un total conocido da 0%, sin warning', () => {
    render(<ImpactIndicator affected={0} total={60} />);
    const percent = screen.getByText('0%');
    expect(percent.className).not.toMatch(/warning/);
  });

  test('por encima del umbral (10% por defecto) marca warning', () => {
    render(<ImpactIndicator affected={7} total={60} />);
    const percent = screen.getByText('11.67%');
    expect(percent.className).toMatch(/warning/);
  });
});
