import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AltchaWidget } from '../AltchaWidget';
import type { Challenge, Solution } from '../types';

// ---------------------------------------------------------------------------
// Mock pow module — avoid real crypto in unit tests
// ---------------------------------------------------------------------------

const mockSolution: Solution = {
  counter: 42,
  derivedKey:
    'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  time: 100,
};

jest.mock('../pow', () => ({
  solveChallengeWorkers: jest
    .fn()
    .mockImplementation(() => Promise.resolve(mockSolution)),
  hasSubtleCrypto: () => true,
  hasScryptSupport: () => false,
  hasArgon2Support: () => false,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fake fetch response — avoids Response.json() JSDOM quirks */
function mockResponse(body: unknown, headers: Record<string, string> = {}) {
  return async () =>
    ({
      status: 200,
      json: async () => body,
      headers: { get: (name: string) => headers[name] ?? null },
    }) as unknown as Response;
}

function mockErrorResponse(status = 400) {
  return async () =>
    ({
      status,
      json: async () => ({}),
      headers: { get: () => null },
    }) as unknown as Response;
}

// ---------------------------------------------------------------------------
// Test challenge — pre-built v2 format
// ---------------------------------------------------------------------------

const testChallenge: Challenge = {
  parameters: {
    algorithm: 'SHA-256',
    nonce: 'aabbccddee112233aabbccddee112233',
    salt: 'aabbccddee112233aabbccddee112233',
    cost: 1,
    keyLength: 32,
    keyPrefix: 'abcdef',
  },
  signature: 'testsignature',
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

test('renders the widget', () => {
  const { getByTestId } = render(<AltchaWidget onVerified={() => {}} />);

  expect(getByTestId('checkbox')).toBeOnTheScreen();
  expect(getByTestId('logo')).toBeOnTheScreen();
  expect(getByTestId('footer')).toBeOnTheScreen();
});

test('hides the logo', () => {
  const { getByTestId, queryByTestId } = render(
    <AltchaWidget hideLogo onVerified={() => {}} />
  );

  expect(getByTestId('checkbox')).toBeOnTheScreen();
  expect(queryByTestId('logo')).not.toBeOnTheScreen();
  expect(getByTestId('footer')).toBeOnTheScreen();
});

test('hides the footer', () => {
  const { getByTestId, queryByTestId } = render(
    <AltchaWidget hideFooter onVerified={() => {}} />
  );

  expect(getByTestId('checkbox')).toBeOnTheScreen();
  expect(getByTestId('logo')).toBeOnTheScreen();
  expect(queryByTestId('footer')).not.toBeOnTheScreen();
});

test('renders custom label', () => {
  const { getByText } = render(
    <AltchaWidget
      customTranslations={{ en: { label: 'custom label' } }}
      onVerified={() => {}}
    />
  );

  expect(getByText('custom label')).toBeOnTheScreen();
});

// ---------------------------------------------------------------------------
// Verification — challenge URL string
// ---------------------------------------------------------------------------

test('verifies via challenge URL and calls onVerified with correct payload', async () => {
  let receivedPayload: string | undefined;

  const { getByTestId } = render(
    <AltchaWidget
      challenge="https://example.com/challenge"
      fetch={mockResponse(testChallenge)}
      onVerified={(p) => {
        receivedPayload = p;
      }}
    />
  );

  fireEvent.press(getByTestId('checkbox'));

  await waitFor(() => expect(receivedPayload).toBeDefined());

  const payload = JSON.parse(atob(receivedPayload!));
  expect(payload.challenge.parameters.algorithm).toBe('SHA-256');
  expect(payload.challenge.signature).toBe('testsignature');
  expect(payload.solution.counter).toBe(42);
  expect(payload.solution.derivedKey).toBe(mockSolution.derivedKey);
});

// ---------------------------------------------------------------------------
// Verification — challenge prop
// ---------------------------------------------------------------------------

test('verifies via challenge prop and calls onVerified', async () => {
  let receivedPayload: string | undefined;

  const { getByTestId } = render(
    <AltchaWidget
      challenge={testChallenge}
      onVerified={(p) => {
        receivedPayload = p;
      }}
    />
  );

  fireEvent.press(getByTestId('checkbox'));

  await waitFor(() => expect(receivedPayload).toBeDefined());

  const payload = JSON.parse(atob(receivedPayload!));
  expect(payload.solution.counter).toBe(42);
});

// ---------------------------------------------------------------------------
// Verification — server verification via verifyUrl (configured by server)
// ---------------------------------------------------------------------------

test('posts to verifyUrl and calls onVerified with server payload', async () => {
  const serverResponse = { verified: true, payload: 'server_payload_123' };
  let receivedPayload: string | undefined;

  const mockFetch = jest
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      json: async () => testChallenge,
      headers: {
        get: (name: string) =>
          name === 'x-altcha-config'
            ? JSON.stringify({ verifyurl: 'https://example.com/verify' })
            : null,
      },
    } as unknown as Response)
    .mockResolvedValueOnce({
      status: 200,
      json: async () => serverResponse,
      headers: { get: () => null },
    } as unknown as Response);

  const { getByTestId } = render(
    <AltchaWidget
      challenge="https://example.com/challenge"
      fetch={mockFetch}
      onVerified={(p) => {
        receivedPayload = p;
      }}
    />
  );

  fireEvent.press(getByTestId('checkbox'));

  await waitFor(() => expect(receivedPayload).toBeDefined());
  expect(receivedPayload).toBe('server_payload_123');

  const verifyCall = mockFetch.mock.calls[1];
  expect(verifyCall[0]).toBe('https://example.com/verify');
  expect(JSON.parse(verifyCall[1].body).payload).toBeDefined();
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

test('shows error when fetch returns non-200 status', async () => {
  let receivedError: string | undefined;

  const { getByTestId } = render(
    <AltchaWidget
      challenge="https://example.com/challenge"
      fetch={mockErrorResponse(400)}
      onFailed={(e) => {
        receivedError = e;
      }}
      onVerified={() => {}}
    />
  );

  fireEvent.press(getByTestId('checkbox'));

  await waitFor(() => expect(receivedError).toBeDefined());
  expect(getByTestId('error')).toBeOnTheScreen();
});

test('shows error when server verification fails', async () => {
  let receivedError: string | undefined;

  const mockFetch = jest
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      json: async () => testChallenge,
      headers: {
        get: (name: string) =>
          name === 'x-altcha-config'
            ? JSON.stringify({ verifyurl: 'https://example.com/verify' })
            : null,
      },
    } as unknown as Response)
    .mockResolvedValueOnce({
      status: 200,
      json: async () => ({ verified: false }),
      headers: { get: () => null },
    } as unknown as Response);

  const { getByTestId } = render(
    <AltchaWidget
      challenge="https://example.com/challenge"
      fetch={mockFetch}
      onFailed={(e) => {
        receivedError = e;
      }}
      onVerified={() => {}}
    />
  );

  fireEvent.press(getByTestId('checkbox'));

  await waitFor(() => expect(receivedError).toBeDefined());
  expect(getByTestId('error')).toBeOnTheScreen();
});

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

test('pressing verified checkbox resets to unverified', async () => {
  let receivedPayload: string | undefined;

  const { getByTestId, getByText } = render(
    <AltchaWidget
      challenge={testChallenge}
      onVerified={(p) => {
        receivedPayload = p;
      }}
    />
  );

  fireEvent.press(getByTestId('checkbox'));
  await waitFor(() => expect(receivedPayload).toBeDefined());
  expect(getByText('Verified')).toBeOnTheScreen();

  fireEvent.press(getByTestId('checkbox'));
  await waitFor(() => expect(getByText("I'm not a robot")).toBeOnTheScreen());
});

// ---------------------------------------------------------------------------
// x-altcha-config header
// ---------------------------------------------------------------------------

test('reads verifyUrl from x-altcha-config response header', async () => {
  const serverResponse = { verified: true, payload: 'header_payload' };

  const mockFetch = jest
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      json: async () => testChallenge,
      headers: {
        get: (name: string) =>
          name === 'x-altcha-config'
            ? JSON.stringify({
                verifyurl: 'https://example.com/verify-from-header',
              })
            : null,
      },
    } as unknown as Response)
    .mockResolvedValueOnce({
      status: 200,
      json: async () => serverResponse,
      headers: { get: () => null },
    } as unknown as Response);

  let receivedPayload: string | undefined;
  const { getByTestId } = render(
    <AltchaWidget
      challenge="https://example.com/challenge"
      fetch={mockFetch}
      onVerified={(p) => {
        receivedPayload = p;
      }}
    />
  );

  fireEvent.press(getByTestId('checkbox'));

  await waitFor(() => expect(receivedPayload).toBe('header_payload'));
  expect(mockFetch.mock.calls[1][0]).toBe(
    'https://example.com/verify-from-header'
  );
});

// ---------------------------------------------------------------------------
// challenge.configuration property
// ---------------------------------------------------------------------------

test('reads verifyUrl from challenge configuration property', async () => {
  const challengeWithConfig: Challenge = {
    ...testChallenge,
    configuration: { verifyUrl: 'https://example.com/verify-from-config' },
  };

  const serverResponse = { verified: true, payload: 'config_payload' };

  const mockFetch = jest.fn().mockResolvedValueOnce({
    status: 200,
    json: async () => serverResponse,
    headers: { get: () => null },
  } as unknown as Response);

  let receivedPayload: string | undefined;
  const { getByTestId } = render(
    <AltchaWidget
      challenge={challengeWithConfig}
      fetch={mockFetch}
      onVerified={(p) => {
        receivedPayload = p;
      }}
    />
  );

  fireEvent.press(getByTestId('checkbox'));

  await waitFor(() => expect(receivedPayload).toBe('config_payload'));
  expect(mockFetch.mock.calls[0][0]).toBe(
    'https://example.com/verify-from-config'
  );
});
