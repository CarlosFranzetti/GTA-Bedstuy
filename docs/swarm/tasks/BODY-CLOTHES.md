# BODY-CLOTHES (Nadia Pell, CLOTHES seat of the body team, 22 Nov 2026 evening)

Status: in progress. Kept current as I go. Scratch and sheets: `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/clothes/`.

## How clothes are made today (read from the code, 22 Nov)
- Torso and sleeves are the BODY mesh itself, offset along the normals by `THICK_SKIN[kind]` (`pedMesh.dressLodBody`, BODY's file), painted into the skin atlas (`pedPaintCloth.ts`). They are not separate shells.
- Trousers are lofted tubes that replace the leg triangles (`pedLegs.legTubes`). Hems of tops and sleeve cuffs are polar strips built by `pedCuts.hemRows`/`cuffRows`, placed by `pedMesh.clothExtras`.
- Separate pieces fitted to the dressed skin: hair, hats (`pedHeadwear`), accessories (`pedGear`), shoes (`pedShoes`) through `pedPiecesKit`.

## Findings
(filled in below as they are made)

## Fit rules
(filled in below)

## Looks
(filled in below)

## Numbers
(filled in below)
