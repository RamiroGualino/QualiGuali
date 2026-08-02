import { render, screen } from '@testing-library/react';
import { describe, test, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { DataQualityScoreCard } from '../src/components/DataQualityScoreCard';

beforeAll(() => i18n.changeLanguage('en'));

describe('DataQualityScoreCard', () => {
  test('sin score, muestra un guión y el mensaje de "sin datos"', () => {
    render(<DataQualityScoreCard score={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Not enough data')).toBeInTheDocument();
  });

  test('con score, muestra el porcentaje y "score / 100"', () => {
    render(<DataQualityScoreCard score={96} />);
    expect(screen.getByText('96%')).toBeInTheDocument();
    expect(screen.getByText('96 / 100')).toBeInTheDocument();
  });

  test('el aria-label del gauge usa el título traducido', () => {
    render(<DataQualityScoreCard score={50} />);
    expect(screen.getByRole('img', { name: 'Data Quality Score' })).toBeInTheDocument();
  });

  test('no muestra las etiquetas de escala 0/100 debajo del gráfico', () => {
    render(<DataQualityScoreCard score={50} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('100')).not.toBeInTheDocument();
  });
});
