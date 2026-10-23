import { createEnvValidator, DatabaseEnvironment } from './env.validation';

class TestEnvironment extends DatabaseEnvironment {
  PORT = 3001;
}

describe('createEnvValidator', () => {
  const validate = createEnvValidator(TestEnvironment);

  it('applies defaults and converts types', () => {
    const env = validate({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      PORT: '4000',
    });

    expect(env.PORT).toBe(4000);
    expect(env.RABBITMQ_URL).toBe('amqp://localhost:5672');
  });

  it('uses the schema default PORT when missing', () => {
    const env = validate({ DATABASE_URL: 'postgres://localhost/db' });

    expect(env.PORT).toBe(3001);
  });

  it('fails fast listing every invalid variable', () => {
    expect(() =>
      validate({ PORT: 'abc', RABBITMQ_URL: 'http://wrong' }),
    ).toThrow(/PORT[\s\S]*RABBITMQ_URL[\s\S]*DATABASE_URL/);
  });
});
