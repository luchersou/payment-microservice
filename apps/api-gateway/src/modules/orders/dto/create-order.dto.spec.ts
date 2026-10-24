import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateOrderDto } from './create-order.dto';

const errorsFor = (body: object) =>
  validateSync(plainToInstance(CreateOrderDto, body)).map((e) => e.property);

describe('CreateOrderDto', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  it('accepts a positive integer amount in cents', () => {
    expect(errorsFor({ userId, totalCents: 1999 })).toEqual([]);
  });

  it.each([19.99, 0, -100, '1999'])('rejects totalCents = %p', (totalCents) => {
    expect(errorsFor({ userId, totalCents })).toEqual(['totalCents']);
  });

  it('no longer accepts the old decimal total field', () => {
    expect(errorsFor({ userId, total: 19.99 })).toEqual(['totalCents']);
  });
});
