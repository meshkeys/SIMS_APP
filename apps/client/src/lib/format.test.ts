import {
  dateParts,
  formatDate,
  formatDayMonth,
  formatDeadline,
  formatInstantDay,
  formatKpiValue,
  formatMoney,
  formatPercent,
  plural,
} from './format';

describe('format', () => {
  it('formats calendar dates as written, whatever the time zone', () => {
    expect(formatDate('2026-10-22')).toBe('22 Oct 2026');
    expect(formatDayMonth('2026-01-01')).toBe('1 Jan');
    expect(dateParts('2026-10-20')).toEqual({ day: '20', month: 'OCT' });
  });

  it("shows instants in the organisation's time zone", () => {
    // 17 Oct 16:00 UTC is 5 pm in Lagos (UTC+1).
    expect(formatDeadline('2026-10-17T16:00:00.000Z', 'Africa/Lagos')).toBe(
      'Sat 17 Oct, 5:00 pm',
    );
    // 23:30 UTC is already the next day in Lagos.
    expect(formatInstantDay('2026-10-17T23:30:00.000Z', 'Africa/Lagos')).toBe(
      '18 Oct',
    );
  });

  it('formats percentages and counts', () => {
    expect(formatPercent(65.625)).toBe('66%');
    expect(formatPercent(null)).toBe('—');
    expect(plural(1, 'day')).toBe('1 day');
    expect(plural(3, 'initiative')).toBe('3 initiatives');
  });

  it('writes KPI values with their units naturally', () => {
    expect(formatKpiValue(18, '%')).toBe('18%');
    expect(formatKpiValue(72, 'h')).toBe('72h');
    expect(formatKpiValue(4.2, 'NGN bn')).toBe('₦4.2bn');
    expect(formatKpiValue(50, 'NGN m')).toBe('₦50m');
    expect(formatKpiValue(40, 'clients')).toBe('40 clients');
    expect(formatKpiValue(1, 'days')).toBe('1 day');
    expect(formatKpiValue(5, 'days')).toBe('5 days');
    expect(formatKpiValue(22, 'score')).toBe('22');
    expect(formatKpiValue(1.5, 'm users')).toBe('1.5m users');
    expect(formatKpiValue(null, '%')).toBe('—');
  });

  it('writes money compactly in the organisation currency', () => {
    expect(formatMoney(50_000_000, 'NGN')).toBe('₦50m');
    expect(formatMoney(1_250_000_000, 'NGN')).toBe('₦1.3bn');
    expect(formatMoney(null, 'NGN')).toBe('—');
  });
});
