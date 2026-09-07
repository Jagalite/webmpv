# Qualification corrections

These diagnostic results are retained separately from final acceptance.

The ready-only startup case exceeded three seconds. The final protocol explicitly warms the decoder/render path with unrelated local media and requires fresh remote PCM/video; it preserves the original timing and byte thresholds. First-use startup remains reported separately.

The shaped MKV paused seek to 2.25 seconds settled at 4 seconds with the default demux preroll. Public half-second preroll recovered the corresponding 2.267-second frame; the final browser binding sets that option. The expanded native-reference test verifies actual karaoke color phases.

The initial karaoke color mask also treated identical glyph/background colors inconsistently between scalers. Final color comparison samples the same native-reference glyph positions for both outputs, retaining the 15-percentage-point threshold.
