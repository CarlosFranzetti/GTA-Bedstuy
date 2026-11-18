# Landmark candidates inside the grown real map (MAP7, 18 Nov 2026)

For the LANDMARKS lane. Everything here comes from NYC Open Data that the real-map import already holds: MapPLUTO (`64uk-42ks`: building class, land use, lot area, residential units, owner) and the Centerline-derived network (street names). PLUTO has **no place names** (no school, church or park names): a name has to come from a separate open source or from the facts below, and nothing here is a verified name. Coordinates are in the game frame (metres, +x east along the Bed-Stuy streets, +z south, origin Throop Ave x Kosciuszko St; `src/world/roadnet/geom.ts` REAL_FRAME) and WGS84. `ring` = which ring the lot is in: R1 / R2 / R2+ were already on the map, **R3 is the new seven-block ring**. Lot ids are BBLs (borough 3 + block + lot): they match `RealLot.bbl` in the game, so a landmark can be attached to a lot with `rw.lots.find(l => l.bbl === ...)` once its tile is loaded (`rw.lotTiles.ensure(x, z, r)`).

Full lists are in `cache/real-r3/lots-r3-all.json` (git-ignored; rebuild with `node scripts/import-lots-real.mjs --r3`). Below: the biggest or most recognisable per category, ring R3 first because those are new.

## Classes used

PLUTO building class: Q* parks and playgrounds (and land use 9), W* schools (W1 public elementary, W2 parochial, W3 junior high, W4 high school, W6 colleges, W7 universities...), M* churches / synagogues / mosques / religious, I* hospitals and health, P* culture (libraries P5, theatres P1..P3, museums P8, community centres P2...), Y* government (fire and police stations, Y1 fire, Y2 police) and Z* misc, units = PLUTO `unitsres` (housing complexes of 150+ units; the New York City Housing Authority appears as owner `NYC HOUSING AUTHORITY`), land use 6 industrial, 5 commercial, 7 transportation and utility.

## Parks, playgrounds and open space

163 lots in the map (83 in R3). Top 30:

| ring | BBL | game x, z | lat, lon | street | class | lot m2 | notes |
|---|---|---|---|---|---|---|---|
| R3 | 3017900001 | -363, 166 | 40.68967, -73.94662 | Greene Ave | Q1 | 31993 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3032030001 | 1759, -1031 | 40.70317, -73.92386 | Suydam St | Q1 | 27778 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3014940001 | 1862, 1030 | 40.68498, -73.91900 | Macon St | Q1 | 13006 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3017380150 | -623, -531 | 40.69552, -73.95092 | Myrtle Ave | Q2 | 12989 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3034050001 | 2804, 333 | 40.69244, -73.90918 | Weirfield St | Q1 | 11148 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3017790027 | -572, -38 | 40.69121, -73.94944 | Kosciuszko St | Q1 | 10411 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3016430013 | 1351, 619 | 40.68795, -73.92572 | Madison St | Q2 | 7952 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3018210025 | 172, 619 | 40.68636, -73.93955 | Madison St | Q1 | 7265 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3031290050 | 438, -1073 | 40.70176, -73.93944 | Flushing Ave | Q2 | 5433 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3017840044 | -545, 50 | 40.69045, -73.94896 | Lafayette Ave | Q2 | 4877 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3022350024 | -913, -1155 | 40.70068, -73.95542 | Middleton St | Q2 | 4459 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3022720013 | -128, -1063 | 40.70091, -73.94605 | Bartlett St | Q2 | 3716 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3019980024 | -1125, 863 | 40.68244, -73.95433 | Jefferson Ave | Q1 | 3457 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3016430001 | 1268, 618 | 40.68784, -73.92670 | Patchen Ave | QG | 2323 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3033650111 | 2563, -90 | 40.69588, -73.91277 | Knickerbocker Ave | Q2 | 1781 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3030820003 | 521, -1512 | 40.70578, -73.93923 | Bushwick Ave | Q2 | 1541 | owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3017890047 | -508, 116 | 40.68992, -73.94842 | Marcy Ave | QG | 1301 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3017890054 | -508, 147 | 40.68964, -73.94836 | Clifton Pl | QG | 557 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3017890044 | -531, 109 | 40.68995, -73.94870 | Lafayette Ave | QG | 465 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3017620018 | -1048, -210 | 40.69209, -73.95532 | Bedford Ave | QG | 372 | owner NEW YORK GARDEN TRUST INC |
| R3 | 3017830004 | -1048, 49 | 40.68979, -73.95487 | Bedford Ave | Q2 | 372 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3017930007 | -1050, 195 | 40.68849, -73.95463 | Bedford Ave | QG | 336 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3017930009 | -1050, 182 | 40.68860, -73.95465 | Clifton Pl | QG | 334 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3014860059 | 1799, 799 | 40.68694, -73.92015 | Jefferson Ave | Q2 | 265 | owner NYS OFF CHILD FAM SVCS |
| R3 | 3014860061 | 1790, 799 | 40.68693, -73.92026 | Jefferson Ave | Q2 | 265 | owner NYS OFF CHILD FAM SVCS |
| R3 | 3014930001 | 1533, 1016 | 40.68466, -73.92289 | Ralph Ave | QG | 261 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3016630082 | 1334, 964 | 40.68486, -73.92531 | Halsey St | QG | 251 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3014830027 | 1669, 685 | 40.68779, -73.92187 | Madison St | QG | 232 | owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3014860001 | 1771, 811 | 40.68680, -73.92046 | Jefferson Ave | Q2 | 232 | owner NYS OFF CHILD FAM SVCS |
| R3 | 3014860002 | 1771, 803 | 40.68687, -73.92048 | Jefferson Ave | Q2 | 232 | owner NYS FAC DEV CORP |

## Schools

95 lots in the map (65 in R3). Top 30:

| ring | BBL | game x, z | lat, lon | street | class | lot m2 | notes |
|---|---|---|---|---|---|---|---|
| R3 | 3033650098 | 2657, -138 | 40.69643, -73.91174 | Putnam Ave | W1 | 24112 | 380 irving avenue; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3022460001 | -320, -1331 | 40.70303, -73.94878 | Walton St | W1 | 11148 | 140 lorimer street; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3033600001 | 2325, 137 | 40.69354, -73.91516 | Madison St | W1 | 11148 | 190 woodbine street; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3022360009 | -752, -1256 | 40.70179, -73.95371 | Middleton St | W1 | 10144 | 370 marcy avenue; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3017390011 | -364, -700 | 40.69737, -73.94817 | Martin Luther King Jr Pl | W1 | 9885 | 662 park avenue; owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3022270001 | -682, -1494 | 40.70400, -73.95331 | Heyward St | W1 | 9755 | 331 marcy avenue; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3017590013 | -345, -367 | 40.69444, -73.94736 | Willoughby Ave | W1 | 9012 | 543 willoughby avenue; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3017430018 | -325, -618 | 40.69669, -73.94757 | Stockton St | W1 | 8919 | 120 martin l king place; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3033580001 | 2043, 420 | 40.69065, -73.91796 | Madison St | W1 | 8879 | 80 woodbine street; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3016360001 | 822, 537 | 40.68797, -73.93207 | Monroe St | W1 | 8826 | 209 stuyvesant avenue; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3014900001 | 1606, 954 | 40.68531, -73.92214 | Halsey St | W1 | 8436 | 145 ralph avenue; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3017840020 | -608, 35 | 40.69051, -73.94973 | Kosciuszko St | W1 | 7897 | 118 kosciuszko street; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3018230038 | -551, 702 | 40.68465, -73.94788 | Putnam Ave | W1 | 6968 | 260 madison street; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3018210001 | 60, 619 | 40.68621, -73.94086 | Madison St | W1 | 6206 | 432 monroe street; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3031140011 | 295, -1207 | 40.70276, -73.94134 | Varet St | W1 | 5806 | 70 varet street; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3016430036 | 1462, 618 | 40.68810, -73.92442 | Madison St | W1 | 5537 | 784 monroe street; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3022680001 | -354, -1025 | 40.70027, -73.94864 | Flushing Ave | W9 | 5345 | 611 flushing avenue; owner 11 BARTLETT OWNER, LLC |
| R3 | 3016300001 | 541, 454 | 40.68832, -73.93551 | Gates Ave | W1 | 4645 | 233 lewis avenue; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3032100001 | 1897, -1112 | 40.70408, -73.92239 | Suydam St | W1 | 4181 | 95 irving avenue; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3030910001 | 547, -1422 | 40.70501, -73.93877 | Seigel St | W1 | 4106 | 325 bushwick avenue; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3017650015 | -804, -232 | 40.69261, -73.95250 | Sandford St | W1 | 3716 | 195 sandford street; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3032120001 | 2171, -1379 | 40.70682, -73.91965 | Suydam St | W1 | 3716 | 61 st nicholas avenue; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3022660001 | -292, -1152 | 40.70148, -73.94813 | Harrison Ave | W9 | 3112 | 177 harrison avenue; owner BAIS RUCHEL HIGH SCHOOL, INC. |
| R3 | 3033770001 | 2533, 154 | 40.69367, -73.91269 | Wilson Ave | W1 | 2973 | 445 wilson avenue; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3034060001 | 2899, 237 | 40.69343, -73.90824 | Knickerbocker Ave | W1 | 2787 | 783 knickerbocker avenue; owner NYC DEPARTMENT OF EDUCATION |
| R3 | 3016330058 | 1432, 440 | 40.68965, -73.92509 | Quincy St | W8 | 2522 | 848 quincy street; owner CHARTER DEVELOPMENT COMPANY |
| R3 | 3022720021 | -86, -1089 | 40.70120, -73.94560 | Throop Ave | W1 | 2323 | 102 bartlett street; owner BETH RACHEL SCHOOL FO |
| R3 | 3031170024 | 769, -1220 | 40.70351, -73.93581 | Varet St | W1 | 2027 | 192 varet street; owner 198-202 VARET STREET CORP. |
| R3 | 3017530042 | -790, -355 | 40.69373, -73.95256 | Nostrand Ave | W2 | 1996 | 184 nostrand avenue; owner BAIS YAAKOV DKHAL ADAS YEREIM |
| R3 | 3033990001 | 2849, 188 | 40.69379, -73.90892 | Weirfield St | W2 | 1877 | 749 knickerbocker avenue; owner ST MARTIN OF TOURS RC |

## Churches and other religious buildings

228 lots in the map (155 in R3). Top 30:

| ring | BBL | game x, z | lat, lon | street | class | lot m2 | notes |
|---|---|---|---|---|---|---|---|
| R3 | 3033290016 | 2700, -686 | 40.70137, -73.91222 | Grove St | M9 | 4506 | 290 st nicholas avenue |
| R3 | 3030910063 | 697, -1425 | 40.70524, -73.93701 | Seigel St | M3 | 3545 | 225 seigel street |
| R3 | 3014790007 | 1579, 462 | 40.68965, -73.92333 | Gates Ave | M9 | 2723 | 1338 broadway |
| R3 | 3022750001 | 15, -1047 | 40.70097, -73.94434 | Thornton St | M1 | 2656 | 58 whipple street |
| R3 | 3017840011 | -684, 37 | 40.69039, -73.95062 | Kosciuszko St | M9 | 2474 | 102 kosciuszko street |
| R3 | 3031660010 | 1529, -1217 | 40.70451, -73.92688 | Melrose St | M1 | 2090 | 390 melrose street |
| R3 | 3017890012 | -705, 125 | 40.68957, -73.95071 | Clifton Pl | M9 | 2067 | 598 lafayette avenue |
| R3 | 3016480060 | 1390, 711 | 40.68718, -73.92510 | Putnam Ave | M1 | 2065 | 897 putnam avenue |
| R3 | 3016410039 | 955, 608 | 40.68751, -73.93038 | Monroe St | M1 | 1953 | 656 monroe street |
| R3 | 3018240001 | -458, 701 | 40.68478, -73.94679 | Marcy Ave | M1 | 1858 | 833 marcy avenue |
| R3 | 3033980033 | 2802, 221 | 40.69343, -73.90941 | Knickerbocker Ave | M1 | 1858 | 750 knickerbocker avenue |
| R3 | 3018130041 | -514, 525 | 40.68627, -73.94776 | Gates Ave | M1 | 1663 | 800 marcy avenue |
| R3 | 3033670004 | 2035, 520 | 40.68974, -73.91787 | Madison St | M1 | 1533 | 1139 bushwick avenue |
| R3 | 3022250042 | -990, -1285 | 40.70173, -73.95655 | Heyward St | M1 | 1310 | 115 heyward street |
| R3 | 3016230063 | 1377, 305 | 40.69078, -73.92597 | Lexington Ave | M1 | 1301 | 869 lexington avenue |
| R3 | 3015000036 | 1714, 1179 | 40.68345, -73.92047 | Mac Donough St | M9 | 1245 | 644 mac donough street |
| R3 | 3016280044 | 1492, 383 | 40.69024, -73.92448 | Ralph Ave | M1 | 1225 | 8 ralph avenue |
| R3 | 3018330038 | -514, 851 | 40.68338, -73.94718 | Jefferson Ave | M1 | 1208 | 260 jefferson avenue |
| R3 | 3018070048 | -797, 437 | 40.68667, -73.95124 | Quincy St | M1 | 1194 | 260 quincy street |
| R3 | 3017350059 | -972, -664 | 40.69623, -73.95524 | Spencer St | M9 | 1161 | 81 spencer street |
| R3 | 3017740051 | -513, -107 | 40.69189, -73.94887 | Dekalb Ave | M1 | 1161 | 685 dekalb avenue |
| R3 | 3016450001 | 518, 686 | 40.68623, -73.93537 | Madison St | M1 | 1115 | 562 madison street |
| R3 | 3019880034 | -1105, 635 | 40.68450, -73.95450 | Madison St | M1 | 1103 | 1160 bedford avenue |
| R3 | 3016560005 | 764, 853 | 40.68508, -73.93219 | Stuyvesant Ave | M1 | 1059 | 279 stuyvesant avenue |
| R3 | 3022750021 | 65, -1067 | 40.70121, -73.94380 | Thornton St | M4 | 996 | 21 thornton street |
| R3 | 3017160044 | -941, -874 | 40.69814, -73.95524 | Walworth St | M9 | 929 | 34 walworth street |
| R3 | 3017550032 | -310, -468 | 40.69538, -73.94713 | Myrtle Ave | M1 | 929 | 874 myrtle avenue |
| R3 | 3018270031 | -919, 784 | 40.68342, -73.95205 | Jefferson Ave | M1 | 929 | 228 putnam avenue |
| R3 | 3033520029 | 2458, -129 | 40.69608, -73.91407 | Palmetto St | M1 | 929 | 592 knickerbocker avenue |
| R3 | 3033950001 | 2274, 767 | 40.68787, -73.91464 | Weirfield St | M1 | 883 | 1243 bushwick avenue |

## Hospitals and health

50 lots in the map (36 in R3). Top 15:

| ring | BBL | game x, z | lat, lon | street | class | lot m2 | notes |
|---|---|---|---|---|---|---|---|
| R3 | 3032600001 | 2302, -1065 | 40.70420, -73.91756 | Stanhope St | I1 | 8458 | 374 stockholm street; owner WYCKOFF HEIGHTS HOSPITAL |
| R3 | 3018260001 | 36, 700 | 40.68545, -73.94100 | Throop Ave | I5 | 3159 | 485 throop avenue; owner NYC DEPARTMENT OF HEALTH AND MENTAL HYGIENE |
| R3 | 3022300013 | -1129, -1139 | 40.70024, -73.95792 | Heyward St | I6 | 2402 | 30 heyward street; owner AISHEL AVRAHAM NURSING HOME CORP |
| R3 | 3016480019 | 1388, 683 | 40.68743, -73.92518 | Madison St | I7 | 1991 | 800 madison street; owner CARING SUPPORTED HOUSING DEVELOPMENT FUN D |
| R3 | 3017510025 | -940, -450 | 40.69437, -73.95449 | Walworth St | I5 | 1909 | 716 myrtle avenue; owner MARC SCOT REALTY CORP |
| R3 | 3016270025 | 1126, 356 | 40.68999, -73.92883 | Lexington Ave | I9 | 1672 | 754 lexington avenue; owner NYS OFFICE OF ALCOHOLISM |
| R3 | 3018240012 | -429, 695 | 40.68488, -73.94646 | Madison St | I6 | 1459 | 296 madison street; owner CONCORD NURSING HOME INC |
| R3 | 3014860006 | 1770, 775 | 40.68712, -73.92053 | Howard Ave | I5 | 1394 | 41 howard avenue; owner NYS OFF CHILD FAM SVCS |
| R3 | 3032590023 | 2192, -959 | 40.70311, -73.91865 | Stanhope St | I5 | 929 | 317 stanhope street; owner 319 STANHOPE LLC |
| R3 | 3016210076 | 800, 304 | 40.69000, -73.93274 | Lexington Ave | I9 | 697 | 703 lexington avenue; owner PROVIDENCE HOUSE INC |
| R3 | 3031990016 | 1869, -1218 | 40.70497, -73.92291 | Starr St | I9 | 697 | 214 starr street; owner 214 ON STARR, LLC |
| R3 | 3017700091 | -696, -189 | 40.69238, -73.95117 | Pulaski St | I7 | 669 | 13 pulaski street; owner SALVATION ARMY PULASKI STREET RESIDENCE  INC |
| R3 | 3019140046 | -1097, -338 | 40.69316, -73.95613 | Willoughby Ave | I9 | 531 | 926 bedford avenue; owner 926 BEDFORD AVE LLC |
| R3 | 3019280043 | -1102, -255 | 40.69242, -73.95603 | Bedford Ave | I7 | 523 | 942 bedford avenue; owner NEW YORK THERAPEUTICCOMMUNITIES INC |
| R3 | 3032480037 | 2187, -1032 | 40.70376, -73.91884 | Stockholm St | I5 | 506 | 112 wyckoff avenue; owner WYCKOFF HEIGHTS MEDICAL CENTER |

## Culture, libraries, community centres

21 lots in the map (15 in R3). Top 20:

| ring | BBL | game x, z | lat, lon | street | class | lot m2 | notes |
|---|---|---|---|---|---|---|---|
| R3 | 3016490001 | 341, 783 | 40.68512, -73.93728 | Jefferson Ave | P9 | 10925 | 367 marcus garvey blvd; owner NYC DEPARTMENT OF HOMELESS SERVICES |
| R3 | 3018120001 | -1023, 542 | 40.68543, -73.95370 | Monroe St | P3 | 4785 | 1119 bedford avenue; owner YMCA OF GREATER N Y |
| R3 | 3030800020 | 320, -1529 | 40.70566, -73.94162 | Humboldt St | P5 | 3066 | 125 humboldt street; owner NYC HOUSING AUTHORITY |
| R3 | 3033500028 | 2177, 175 | 40.69300, -73.91682 | Central Ave | P5 | 2323 | 422 central avenue; owner HOPE GARDENS 1 LLC |
| R3 | 3018860019 | -1133, -916 | 40.69826, -73.95757 | Skillman St | P9 | 2203 | 7 skillman street; owner BEDFORD FLUSHING HOLDING CORP. |
| R3 | 3030040001 | 1273, -1453 | 40.70627, -73.93031 | Knickerbocker Ave | P9 | 1886 | 53 knickerbocker avenue; owner ALL SEVEN CO |
| R3 | 3033740001 | 2096, 586 | 40.68924, -73.91704 | Bushwick Ave | P5 | 1858 | 1169 bushwick avenue; owner SALVATION ARMY CORP |
| R3 | 3030960030 | 146, -1369 | 40.70401, -73.94337 | Moore St | P5 | 1433 | 80 seigel street; owner NYC HOUSING AUTHORITY |
| R3 | 3017740081 | -715, -108 | 40.69163, -73.95124 | Dekalb Ave | P8 | 1064 | 625 dekalb avenue; owner BROOKLYN PUBLIC LIBRARY |
| R3 | 3030980019 | 467, -1381 | 40.70455, -73.93963 | Seigel St | P8 | 1007 | 172 seigel street; owner BROOKLYN PUBLIC LIBRARY |
| R3 | 3016220060 | 1128, 306 | 40.69043, -73.92890 | Lexington Ave | P5 | 960 | 803 lexington avenue; owner ST. JOHN'S BREAD & LIFE PROGRAM, INC. |
| R3 | 3033620032 | 2635, -261 | 40.69750, -73.91222 | Woodbine St | P8 | 929 | 360 irving avenue; owner BROOKLYN PUBLIC LIBRARY |
| R3 | 3030120011 | 1188, -1310 | 40.70488, -73.93105 | Thames St | P1 | 825 | 32 morgan avenue; owner INDUSTRIOUS LLC |
| R3 | 3018330003 | -738, 845 | 40.68313, -73.94982 | Jefferson Ave | P2 | 557 | 423 nostrand avenue; owner MOST WORSHIP ENOCH GRAND LODGE INC |
| R3 | 3018170054 | -789, 614 | 40.68511, -73.95083 | Nostrand Ave | P2 | 186 | 414 nostrand avenue; owner DAVIS, GEORGE P |
| R2 | 3032410018 | 1244, -170 | 40.69481, -73.92837 | Dekalb Ave | P8 | 1245 | 790 bushwick avenue; owner BROOKLYN PUBLIC LIBRARY |
| R2 | 3033310025 | 1877, 266 | 40.69179, -73.92018 | Gates Ave | P2 | 841 | 1165 gates avenue; owner 1175 GATES  AVE LLC |
| R1 | 3017610066 | 60, -357 | 40.69489, -73.94259 | Willoughby Ave | P9 | 836 | 665 willoughby avenue; owner COMMUNITY DEVELOPMENT SUPPORT SERVICES F OUNDATION |
| R1 | 3015900004 | 762, -390 | 40.69612, -73.93441 | Stuyvesant Ave | P9 | 523 | 5 stuyvesant avenue; owner BANG KEUN & SONS CORP. |
| R2 | 3032150001 | 1121, -383 | 40.69655, -73.93020 | Hart St | P2 | 518 | 719 bushwick avenue; owner NUBIAN ISLAMIC HEBREWS MI/A.A.A |

## Government, fire and police

193 lots in the map (127 in R3). Top 15:

| ring | BBL | game x, z | lat, lon | street | class | lot m2 | notes |
|---|---|---|---|---|---|---|---|
| R3 | 3031000022 | 738, -1361 | 40.70473, -73.93643 | Moore St | Z9 | 12578 | 215 moore street; owner NYM 215 MOORE, LLC |
| R3 | 3022330001 | -626, -1431 | 40.70351, -73.95255 | Lynch St | Y4 | 11613 | 355 marcy avenue; owner NYS DIVISION MILITARY & NAVAL AFFAI |
| R3 | 3017180001 | -805, -835 | 40.69797, -73.95358 | Warsoff Pl | Y6 | 9972 | 60 nostrand avenue; owner NYC DEPARTMENT OF SANITATION |
| R3 | 3018190014 | -355, 619 | 40.68565, -73.94573 | Madison St | Y1 | 9030 | 308 monroe street; owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3030920001 | 906, -1461 | 40.70585, -73.93463 | Mc Kibbin St | Z9 | 6364 | 62 white street; owner NYC DEPARTMENT OF PARKS AND RECREATION |
| R3 | 3031200016 | 304, -1124 | 40.70203, -73.94109 | Debevoise St | Z3 | 2787 | 41 humboldt street; owner USPS |
| R3 | 3029930011 | 1481, -1622 | 40.70805, -73.92817 | Ingraham St | Z9 | 2415 | 498 johnson avenue; owner 498-512 JOHNSON AVE BROOKLYN LLC |
| R3 | 3016330039 | 1489, 454 | 40.68960, -73.92440 | Ralph Ave | Y2 | 2334 | 18 ralph avenue; owner NYC POLICE DEPARTMENT |
| R3 | 3030830016 | 953, -1557 | 40.70676, -73.93425 | Boerum St | Z9 | 2183 | 328 boerum street; owner BOGART PLAZA LLC |
| R3 | 3030830030 | 955, -1526 | 40.70649, -73.93417 | Mc Kibbin St | Z9 | 2137 | 79 bogart street; owner BOGART PLAZA LLC |
| R3 | 3029940001 | 1581, -1624 | 40.70820, -73.92701 | Varick Ave | Z9 | 1858 | 526 johnson avenue; owner 28 VARICK AVENUE LLC |
| R3 | 3017360001 | -880, -719 | 40.69684, -73.95426 | Park Ave | Z9 | 1528 | 528 park avenue; owner ROPO, LLC |
| R3 | 3029960040 | 1879, -1630 | 40.70866, -73.92352 | Ingraham St | Z9 | 1301 | 239 ingraham street; owner M&S LEVY REALTY, |
| R3 | 3030820089 | 550, -1496 | 40.70568, -73.93887 | Mc Kibbin St | Z9 | 1208 | 219 mc kibbin street; owner SWC 219 OWNER LLC |
| R3 | 3031090051 | 784, -1270 | 40.70398, -73.93572 | Varet St | Z9 | 1195 | 217 varet street; owner VARET MOORE REALTY INC. |

## Big housing complexes (150+ residential units)

38 lots (17 in R3). Sorted by units (the "lot m2" column below is the unit count, not an area). Top 30:

| ring | BBL | game x, z | lat, lon | street | class | units | owner |
|---|---|---|---|---|---|---|---|
| R1 | 3015950024 | 672, -207 | 40.69438, -73.93515 | Hart St | D3 | 1624 | NYC HOUSING AUTHORITY |
| R3 | 3017380001 | -623, -642 | 40.69651, -73.95111 | Park Ave | D3 | 1300 | NYC HOUSING AUTHORITY |
| R3 | 3031290001 | 481, -1177 | 40.70275, -73.93912 |  | D3 | 1220 | NYC HOUSING AUTHORITY |
| R1 | 3015800001 | 371, -616 | 40.69761, -73.93941 | Lewis Ave | D1 | 1099 | NYC HOUSING AUTHORITY |
| R1 | 3017400001 | -119, -617 | 40.69696, -73.94515 |  | D3 | 1046 | NYC HOUSING AUTHORITY |
| R3 | 3030780001 | -4, -1457 | 40.70459, -73.94530 | Manhattan Ave | D4 | 774 | LINDSAY PARK |
| R3 | 3030770001 | -138, -1472 | 40.70453, -73.94689 | Leonard St | D4 | 772 | LINDSAY PARK HGS CORP |
| R1 | 3017490015 | 145, -606 | 40.69721, -73.94204 | Marcus Garvey Blvd | D3 | 514 | NYC HOUSING AUTHORITY |
| R2+ | 3031410001 | 736, -966 | 40.70121, -73.93575 | Montieth St | D7 | 500 | EVERGREEN GARDENS II LLC |
| R2+ | 3031520048 | 902, -778 | 40.69977, -73.93346 | Melrose St | D6 | 468 | ACI VI DENIZEN LLC |
| R2+ | 3031520001 | 891, -845 | 40.70035, -73.93371 | Noll St | D6 | 443 | ACI VI DENIZEN LLC |
| R2 | 3033250060 | 2228, -192 | 40.69634, -73.91687 | Linden St | D1 | 353 | NYC HOUSING AUTHORITY |
| R2+ | 3031547501 | 1188, -1079 | 40.70283, -73.93064 | George St | RM | 324 | NOLL STREET REALTY USA LLC |
| R2 | 3033150001 | 2053, -140 | 40.69564, -73.91884 | Grove St | D3 | 306 | HOPE GARDENS 1 LLC |
| R1 | 3015970001 | 367, -123 | 40.69322, -73.93858 | Dekalb Ave | D3 | 270 | NYC HOUSING AUTHORITY |
| R3 | 3030760018 | -252, -1540 | 40.70499, -73.94834 | Lorimer St | D6 | 270 | 555 BROADWAY LLC |
| R1 | 3015880001 | 353, -370 | 40.69540, -73.93918 | Willoughby Ave | D6 | 267 | HP WILLOUGHBY HOUSING CORPORATION |
| R1 | 3015880010 | 427, -372 | 40.69552, -73.93832 | Vernon Ave | D6 | 267 | HP WILLOUGHBY HOUSING CORPORATION |
| R1 | 3016010024 | 447, -40 | 40.69259, -73.93749 | Kosciuszko St | D3 | 248 | NYC HOUSING AUTHORITY |
| R3 | 3030800010 | 283, -1515 | 40.70549, -73.94203 | Mc Kibbin St | D3 | 248 | NYC HOUSING AUTHORITY |
| R1 | 3015850001 | 336, -453 | 40.69611, -73.93953 | Vernon Ave | D3 | 234 | NYC HOUSING AUTHORITY |
| R1 | 3015867501 | 619, -459 | 40.69654, -73.93622 | Myrtle Ave | RM | 233 | SPENCERAN INC |
| R3 | 3018120042 | -810, 532 | 40.68581, -73.95122 | Gates Ave | D1 | 214 | NORGATE HOUSING DEVELOPMENT FUND CORPORA TION |
| R1 | 3015920001 | 532, -288 | 40.69491, -73.93694 | Hart St | D7 | 205 | ROMAN CATHOLIC CHURCH |
| R3 | 3030980001 | 428, -1363 | 40.70433, -73.94006 | Moore St | D9 | 205 | NYC HOUSING AUTHORITY |
| R3 | 3018110019 | 172, 453 | 40.68783, -73.93984 | Gates Ave | D7 | 192 | WILLARD J. PRICE ASOCIATES, LLC |
| R1 | 3015800010 | 278, -618 | 40.69750, -73.94050 | Marcus Garvey Blvd | D7 | 190 | NYC HOUSING AUTHORITY |
| R1 | 3015980001 | 612, -122 | 40.69354, -73.93570 | Dekalb Ave | D3 | 187 | NYC HOUSING AUTHORITY |
| R1 | 3015950001 | 544, -208 | 40.69422, -73.93665 | Hart St | D3 | 175 | NYC HOUSING AUTHORITY |
| R3 | 3016290001 | 353, 465 | 40.68798, -73.93770 | Gates Ave | D1 | 175 | 745 GATES HDFC |

## Big industrial lots (9,000+ m2)

10 lots in the map (8 in R3). Top 20:

| ring | BBL | game x, z | lat, lon | street | class | lot m2 | notes |
|---|---|---|---|---|---|---|---|
| R3 | 3029740051 | 1389, -1857 | 40.71002, -73.92966 |  | F2 | 26133 | 103 varick avenue |
| R3 | 3017200001 | -363, -948 | 40.69958, -73.94860 | Hopkins St | F5 | 13471 | 475 marcy avenue |
| R3 | 3029740113 | 1459, -1711 | 40.70881, -73.92859 | Johnson Ave | E1 | 13179 | 101 varick avenue |
| R3 | 3029740170 | 1213, -1702 | 40.70840, -73.93145 | Johnson Ave | E1 | 13146 | 100 knickerbocker avenue |
| R3 | 3029740001 | 1192, -1800 | 40.70924, -73.93188 | Morgan Ave | E1 | 10164 | 134 morgan avenue |
| R3 | 3017170006 | -882, -846 | 40.69797, -73.95451 | Walworth St | E1 | 10018 | 39 walworth street |
| R3 | 3029940105 | 1610, -1526 | 40.70737, -73.92649 | Varick Ave | E1 | 9848 | 28 varick avenue |
| R3 | 3029940090 | 1620, -1419 | 40.70643, -73.92618 | Varick Ave | F4 | 9290 | 1177 flushing avenue |
| R2+ | 3031400001 | 866, -986 | 40.70157, -73.93425 | Stanwix St | E1 | 20928 | 930 flushing avenue |
| R2+ | 3031630001 | 1084, -762 | 40.69987, -73.93130 | Melrose St | E7 | 9337 | 105 evergreen avenue |

## Big commercial lots (12,000+ m2)

2 lots in the map (2 in R3). Top 12:

| ring | BBL | game x, z | lat, lon | street | class | lot m2 | notes |
|---|---|---|---|---|---|---|---|
| R3 | 3017640001 | -845, -152 | 40.69185, -73.95285 | Sandford St | K8 | 16267 | 585 dekalb avenue |
| R3 | 3030560230 | 888, -1678 | 40.70775, -73.93522 | Johnson Ave | J6 | 12161 | 333 johnson avenue |

