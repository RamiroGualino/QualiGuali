import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { LoginPage } from '../src/pages/LoginPage';
import { AuthProvider } from '../src/auth/AuthContext';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { authApi } from '../src/api/auth.api';

vi.mock('../src/api/auth.api', () => ({
  authApi: {
    login: vi.fn(),
    me: vi.fn(),
  },
}));

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <ThemeProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  test('renders email and password fields', () => {
    renderLoginPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña|password/i)).toBeInTheDocument();
  });

  test('calls authApi.login with the entered credentials on submit', async () => {
    authApi.login.mockResolvedValue({
      token: 'abc',
      user: { email: 'qa@qg.com', role: 'qa_engineer' },
    });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'qa@qg.com');
    await user.type(screen.getByLabelText(/contraseña|password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /ingresar|sign in/i }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('qa@qg.com', 'Password123!');
    });
  });

  test('shows an error message when login fails', async () => {
    authApi.login.mockRejectedValue(new Error('Invalid credentials'));
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'qa@qg.com');
    await user.type(screen.getByLabelText(/contraseña|password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /ingresar|sign in/i }));

    expect(await screen.findByText(/inválid|invalid/i)).toBeInTheDocument();
  });
});
