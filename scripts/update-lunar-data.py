"""Generate offline Korean lunar month boundaries; pip install korean-lunar-calendar==0.3.1."""
import json
from pathlib import Path
from korean_lunar_calendar import KoreanLunarCalendar
calendar = KoreanLunarCalendar()
months = []
for year in range(2019, 2036):
    for month in range(1, 13):
        for leap in (False, True):
            if not calendar.setLunarDate(year, month, 1, leap) or calendar.isIntercalation != leap:
                continue
            start = calendar.SolarIsoFormat()
            length = 30 if calendar.setLunarDate(year, month, 30, leap) else 29
            months.append([year, month, int(leap), start, length])
Path('src/lunar-data.js').write_text(
    '// Korean lunar calendar month boundaries, korean-lunar-calendar 0.3.1.\n'
    '// [lunar year, month, leap month, first solar date, days]\n'
    'export const lunarMonths = ' + json.dumps(months, separators=(',', ':')) + ';\n', encoding='utf-8')
print(f'Generated {len(months)} Korean lunar months.')
