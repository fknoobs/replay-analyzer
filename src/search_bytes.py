
import sys

with open('../../replays/2Sturzdorf_972025757__[GameReplays.org].rec', 'rb') as f:
    data = f.read()
    # Search for 33 00 .. .. E8 03
    # We iterate and check
    count = 0
    for i in range(len(data) - 6):
        if data[i] == 0x33 and data[i+1] == 0x00 and data[i+4] == 0xE8 and data[i+5] == 0x03:
            print(f"Found at {i}: {data[i:i+20].hex()}")
            count += 1
            if count > 10: break
