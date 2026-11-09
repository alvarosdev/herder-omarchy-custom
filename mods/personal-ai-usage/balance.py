import json
import os
import subprocess
import urllib.error
import urllib.request

key = os.environ.get('DEEPSEEK_API_KEY', '').strip()
if not key:
    result = subprocess.run(['security', 'find-generic-password', '-s', 'herdr-deepseek-api-key', '-w'], capture_output=True, text=True)
    key = result.stdout.strip() if result.returncode == 0 else ''
if not key:
    print(json.dumps({'error': 'Add a DeepSeek API key to Keychain'}))
else:
    try:
        request = urllib.request.Request('https://api.deepseek.com/user/balance', headers={'Authorization': 'Bearer ' + key})
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.load(response)
        balances = data.get('balance_infos', [])
        if not isinstance(balances, list) or not balances:
            raise ValueError('Missing balance')
        print(json.dumps({'available': data.get('is_available', False), 'balances': [{'currency': b['currency'], 'total': b['total_balance']} for b in balances]}))
    except urllib.error.HTTPError as error:
        print(json.dumps({'error': 'DeepSeek returned HTTP ' + str(error.code)}))
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, OSError):
        print(json.dumps({'error': 'Could not read DeepSeek balance'}))
