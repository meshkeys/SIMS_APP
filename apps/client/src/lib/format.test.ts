import {
  dateParts,
  formatDate,
  formatDayMonth,
  formatDeadline,
  formatInstantDay,
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
});
