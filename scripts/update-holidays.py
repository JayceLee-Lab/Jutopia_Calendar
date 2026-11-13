"""python -m pip install holidays==0.108; python scripts/update-holidays.py"""
import json
from pathlib import Path
import holidays
calendar = holidays.KR(years=range(2020, 2051), language='ko')
Path('data/holidays.json').write_text(
    json.dumps({str(day): name for day, name in sorted(calendar.items())}, ensure_ascii=False, indent=2) + '\n',
    encoding='utf-8',
)
print(f'Updated {len(calendar)} holidays using python-holidays {holidays.__version__}')
