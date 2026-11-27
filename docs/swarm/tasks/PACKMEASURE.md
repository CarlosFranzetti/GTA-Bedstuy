# PACKMEASURE (27 Nov): done, numbers in `docs/reference/pack-measurements.md`

- The zip is over Drive's 10 MB connector limit; the unpacked folder (id `1-X6ZYPEkD7u2I91RJ3-B63FXeLdhU7Yi`) was used instead.
- The folder holds only 2 .dff models (Car A, a large sedan; Car B, the fan car), about 35 .txd texture sets, a few 128 px tiles
  and three small text files. No pedestrian or building meshes. People and buildings are therefore measured as textures only.
- Throwaway Python readers lived in scratch; nothing from the pack is in the repository. `src/mods` untouched. A temporary
  test used to count our car triangles was deleted again.
- No parser bug of our own was found this time (the earlier texture-parser cause is in MODS.md, MODS3). One note for the
  MODS lane: geometry flags carry the number of UV sets in the upper 16 bits; and the library stamp 0x0800FFFF must be
  decoded to a version below 0x34000, which means a 12-byte lighting block sits before the vertex data.
