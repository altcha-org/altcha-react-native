import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AltchaWidget } from '../AltchaWidget';

const testChallenge = {
  algorithm: 'SHA-256',
  challenge: 'c2fc6c6adf8ba0f575a35f48df52c0968a3dcd3c577c2769dc2f1035943b975e', // hash for "salt123"
  maxNumber: 1000,
  salt: 'salt',
  signature: '612d40361f9708e5cf44f6001e66542efb70cb337a8b6bc47c7f32609d503127', // HMAC Key "secret123"
};

test('should render the widget', () => {
  const { getByTestId } = render(<AltchaWidget onVerified={() => {}} />);

  expect(getByTestId('checkbox')).toBeOnTheScreen();
  expect(getByTestId('logo')).toBeOnTheScreen();
  expect(getByTestId('footer')).toBeOnTheScreen();
});

test('should hide the logo', () => {
  const { getByTestId, queryByTestId } = render(
    <AltchaWidget hideLogo onVerified={() => {}} />
  );

  expect(getByTestId('checkbox')).toBeOnTheScreen();
  expect(queryByTestId('logo')).not.toBeOnTheScreen();
  expect(getByTestId('footer')).toBeOnTheScreen();
});

test('should hide the footer', () => {
  const { getByTestId, queryByTestId } = render(
    <AltchaWidget hideFooter onVerified={() => {}} />
  );

  expect(getByTestId('checkbox')).toBeOnTheScreen();
  expect(getByTestId('logo')).toBeOnTheScreen();
  expect(queryByTestId('footer')).not.toBeOnTheScreen();
});

test('should change the label', () => {
  const { getByText } = render(
    <AltchaWidget
      customTranslations={{
        en: {
          label: 'test label',
        },
      }}
      onVerified={() => {}}
    />
  );

  expect(getByText('test label')).toBeOnTheScreen();
});

test('should verify and call onVerified callback with challengeUrl', async () => {
  let receivedPayload: string | undefined;
  const mockOnVerified = jest.fn((payload) => {
    receivedPayload = payload;
  });
  const { getByTestId } = render(
    <AltchaWidget
      challengeUrl="https://example.com/altcha"
      fetch={async () =>
        new Response(JSON.stringify(testChallenge), {
          headers: {
            'Content-Type': 'application/json',
          },
        })
      }
      onVerified={mockOnVerified}
    />
  );

  fireEvent.press(getByTestId('checkbox'));

  await waitFor(() => expect(receivedPayload).toBeDefined());
  const payload = JSON.parse(atob(receivedPayload!));
  expect(payload.algorithm).toBe(testChallenge.algorithm);
  expect(payload.challenge).toBe(testChallenge.challenge);
  expect(payload.number).toBe(123);
  expect(payload.salt).toBe(testChallenge.salt);
  expect(payload.signature).toBe(testChallenge.signature);
});

test('should verify and call onVerified callback with challengeJson', async () => {
  let receivedPayload: string | undefined;
  const mockOnVerified = jest.fn((payload) => {
    receivedPayload = payload;
  });
  const { getByTestId } = render(
    <AltchaWidget challengeJson={testChallenge} onVerified={mockOnVerified} />
  );

  fireEvent.press(getByTestId('checkbox'));

  await waitFor(() => expect(receivedPayload).toBeDefined());
  const payload = JSON.parse(atob(receivedPayload!));
  expect(payload.algorithm).toBe(testChallenge.algorithm);
  expect(payload.challenge).toBe(testChallenge.challenge);
  expect(payload.number).toBe(123);
  expect(payload.salt).toBe(testChallenge.salt);
  expect(payload.signature).toBe(testChallenge.signature);
});

test('should show error if fetch returns statusCode != 200', async () => {
  let receivedError: string | undefined;
  const mockOnFailed = jest.fn((err: string) => {
    receivedError = err;
  });
  const { getByTestId } = render(
    <AltchaWidget
      challengeUrl="https://example.com/altcha"
      fetch={async () =>
        new Response('error', {
          status: 400,
        })
      }
      onFailed={mockOnFailed}
      onVerified={() => {}}
    />
  );

  fireEvent.press(getByTestId('checkbox'));

  await waitFor(() => expect(receivedError).toBeDefined());
  expect(getByTestId('error')).toBeOnTheScreen();
});
