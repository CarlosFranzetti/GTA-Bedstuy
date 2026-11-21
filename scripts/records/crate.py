#!/usr/bin/env python3
"""Builds the WAX DELI archive crate: downloads each source file, cuts a clip, re-encodes it small, and measures tempo.

Run from anywhere:  python3 -I scripts/records/crate.py <work-dir> [only-id ...]
Needs ffmpeg and numpy. Output: public/records/<id>.mp3 and <work-dir>/measure.json.
The CATALOGUE here (real credits) is mirrored by src/game/archiveRecords.ts (parody sleeves + credits); a unit test checks they agree.
Sources: Internet Archive items only (public domain by 17 U.S.C. 1401, first published 1925 or earlier; see docs/swarm/tasks/RECORDS.md).
ccMixter file downloads answer 403 and Free Music Archive downloads need a login, so no CC BY crate is built here.
"""
import json, os, subprocess, sys, urllib.parse, urllib.request
import numpy as np

IA = 'https://archive.org/download/'
# id, source key, file, start s, duration s, kind ('ia' or url)
CLIPS = [
 ('ia-castle', 'Europes_Society_Orch-Castle_Rag', 'Europes_Society_Orch-Castle_House_Rag-Victor-35372.mp3', 0, 80),
 ('ia-drag', 'Joseph_Moskowitz-Panama_Pacific_Drag', 'Joseph_Moskowitiz-Panama-Pacific_Drag.mp3', 0, 80),
 ('ia-pickle', 'WilliamHReitz', 'WilliamHReitz-DillPicklesRagXylophoneSolo.mp3', 0, 80),
 ('ia-banjo', 'Fred_Van_Eps-Rag_Pickings', 'Fred_Van_Eps-Rag_Pickings-Victor-16934-11.mp3', 0, 80),
 ('ia-livery', 'OriginalDixielandJassBand', 'OriginalDixielandJassBand-LiveryStableBlues.mp3', 0, 80),
 ('ia-africa', '78_africa_original-memphis-five-hanley_gbia0101463a', 'Africa - Original Memphis Five - Hanley.mp3', 0, 80),
 ('ia-fouroclock', 'Original_Memphis_Five-Four_O_Clock_Blues', 'Original_Memphis_Five-Four_O_Clock_Blues-Vocalion-14506-1923.mp3', 0, 80),
 ('ia-cakewalk', 'ClarenceWilliamsBlueFive', 'ClarenceWilliamsBlueFive-CakeWalkingBabiesfromHome.mp3', 0, 80),
 ('ia-stomp', 'king-olivers-jazz-band-new-orleans-stomp-shimmy-one-step-columbia-13003-d-81304-', "King Oliver's Jazz Band - New Orleans Stomp, Shimmy One Step - Columbia 13003D, 81304, Matrix 81304 2-1 - October 16, 1923.mp3", 0, 80),
 ('ia-shake', 'FletcherHenderson', 'FletcherHenderson-ShakeYourFeet.mp3', 0, 80),
 ('ia-charleston', 'charleston1925', 'charleston1925_64kb.mp3', 0, 80),
 ('ia-mail', 'Tennessee_Ten-Three_Jazz_Sides_From_1923', 'Tennessee_Ten-Waitin_for_the_Evenin_Mail.mp3', 0, 80),
 ('ia-rhapsody', 'rhapblue11924', 'rhapblue11924_64kb.mp3', 0, 80),
 ('ia-crazy', 'MamieSmithHerJazzHounds', 'MamieSmithHerJazzHounds-CrazyBlues_64kb.mp3', 0, 80),
 ('ia-gulf', 'loc-jukebox-670192-gulf-coast-blues', 'jukebox-670192_gulf-coast-blues.mp3', 0, 80),
 ('ia-chicago', 'loc-jukebox-672304-chicago-bound-blues', 'jukebox-672304_chicago-bound-blues.mp3', 0, 80),
 ('ia-everybody', 'Lucille_Hegamin-Everybodys_Blues', 'Lucille_Hegamin-Everybodys_Blues-Bell-P45-1920_64kb.mp3', 0, 80),
 ('ia-strut', 'Leona_Williams-Struttin_Blues', 'Leona_Williams-Struttin_Blues_64kb.mp3', 0, 80),
 ('ia-advertise', 'Clara_Smith-Dont_Advertise_Your_Man', 'Clara_Smith-Dont_Advertise_Your_Man_64kb.mp3', 0, 80),
 ('ia-fisk-swing', 'fisk-university-jubilee-quartet-swing-low-sweet-chariot-victor-16453-a', 'Fisk University Jubilee Quartet - Swing Low, Sweet Chariot - Victor 16453-A.mp3', 0, 80),
 ('ia-fisk-slippers', 'fisk-university-jubilee-quartet-golden-slippers-victor-16453-b', 'Fisk University Jubilee Quartet - Golden Slippers - Victor 16453-B.mp3', 0, 80),
 ('ia-bethel', 'loc-jukebox-67444-ain-t-it-a-shame-to-work-on-sunday', 'jukebox-67444_ain-t-it-a-shame-to-work-on-sunday.mp3', 0, 80),
 ('ia-southern4', 'EDIS-SRP-0196-01', 'EDIS-SRP-0196-01.mp3', 0, 80),
 ('ia-ferera', 'southern1924', 'southern1924_64kb.mp3', 0, 80),
 ('ia-hawaiian', 'Irene_West_Royal_Hawaiians_Hawaiian_Waltz_Medly_Hawaiian_Guitar_Duet_', 'HawaiianWaltzMedly_64kb.mp3', 0, 80),
 ('ia-birmingham', '78_birmingham-blues_fats-waller_gbia0388856b', 'BIRMINGHAM BLUES - FATS WALLER.mp3', 0, 80),
 ('ia-glide', '78_the-new-york-glide_ethel-waters-alburys-blue-and-jazz-seven-tom-delaney_gbia0275389b', "THE NEW YORK GLIDE - ETHEL WATERS - ALBURY'S BLUE AND JAZZ SEVEN.mp3", 0, 80),
 ('ia-sisterkate', 'Virginians', 'Virginians-IWishICouldShimmyLikeMySisterKate.mp3', 0, 80),
]

def estimate(x, sr, fb=120.0):
    """numpy port of estimateBpm in src/game/records.ts; also returns the pulse strength (best / sum0)."""
    hop = max(1, int(sr * 0.01)); frames = len(x) // hop
    if frames < 300: return fb, 0.0
    env = np.sqrt((x[:frames*hop].reshape(frames, hop) ** 2).mean(axis=1))
    onset = np.maximum(0, np.diff(env, prepend=env[0])); onset[0] = 0
    mean = onset.sum() / frames
    if mean < 1e-6: return fb, 0.0
    onset = onset - mean
    fps = sr / hop; sum0 = float((onset ** 2).sum())
    lo = int(np.floor(fps * 60 / 180)); hi = int(np.ceil(fps * 60 / 70)); best = -1e18; bl = 0
    for lag in range(lo, hi + 1):
        s = float((onset[:frames-lag] * onset[lag:]).sum()); l2 = lag * 2
        s2 = float((onset[:frames-l2] * onset[l2:]).sum()) if l2 < frames else 0.0
        sc = s + 0.5 * s2
        if sc > best: best, bl = sc, lag
    if bl == 0 or best < sum0 * 0.02: return fb, best / max(sum0, 1e-9)
    bpm = fps * 60 / bl
    while bpm < 80: bpm *= 2
    while bpm > 160: bpm /= 2
    return round(bpm * 10) / 10, best / sum0

def main():
    work = sys.argv[1]; only = set(sys.argv[2:])
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '..', '..', 'public', 'records'); os.makedirs(out, exist_ok=True)
    os.makedirs(os.path.join(work, 'dl'), exist_ok=True)
    res = {}
    mpath = os.path.join(work, 'measure.json')
    if os.path.exists(mpath): res = json.load(open(mpath))
    for cid, key, f, start, dur in CLIPS:
        if only and cid not in only: continue
        url = f if key == 'cc' else IA + urllib.parse.quote(key) + '/' + urllib.parse.quote(f)
        src = os.path.join(work, 'dl', cid + '.src.mp3')
        if not os.path.exists(src):
            subprocess.run(['curl', '-sSL', '--fail', '-m', '180', '-o', src, url], check=True)
        dst = os.path.join(out, cid + '.mp3')
        old = key != 'cc'
        enc = ['-ac', '1', '-ar', '22050', '-b:a', '40k'] if old else ['-ac', '2', '-ar', '44100', '-b:a', '56k', '-joint_stereo', '1']
        fade = f'afade=t=in:d=0.25,afade=t=out:st={dur-1.5}:d=1.5,alimiter=limit=0.92'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(start), '-t', str(dur), '-i', src, '-af', fade, '-c:a', 'libmp3lame', *enc, '-map_metadata', '-1', dst], check=True)
        pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', dst, '-f', 'f32le', '-ac', '1', '-ar', '11025', '-'], capture_output=True, check=True).stdout
        x = np.frombuffer(pcm, dtype=np.float32); sr = 11025
        bpm, conf = estimate(x, sr)
        thirds = [estimate(x[i*len(x)//3:(i+1)*len(x)//3], sr)[0] for i in range(3)]
        spread = (max(thirds) - min(thirds)) / bpm
        res[cid] = {'bpm': bpm, 'pulse': round(conf, 3), 'thirds': thirds, 'spread': round(spread, 3), 'bytes': os.path.getsize(dst), 'secs': round(len(x) / sr, 1)}
        print(cid, res[cid], flush=True)
    json.dump(res, open(mpath, 'w'), indent=1)

if __name__ == '__main__': main()
