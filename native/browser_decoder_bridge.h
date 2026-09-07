#ifndef WEB_BROWSER_DECODER_BRIDGE_H
#define WEB_BROWSER_DECODER_BRIDGE_H
#include <stdint.h>
#include <stdatomic.h>
#define WEB_DEC_PACKET_MAX (8 * 1024 * 1024)
#define WEB_DEC_FRAME_MAX (1920 * 1080 * 3 / 2)
// One native decoder thread owns requests. Browser worker acknowledges the ticket
// before native ownership can be reused. Fields are published by the state atomic.
struct browser_decoder_mailbox {
    _Atomic int state;
    int serial, operation, result;
    int size, width, height, key;
    int format, primaries, transfer, matrix;
    int full_range, reserved[3];
    double timestamp, duration;
    unsigned char packet[WEB_DEC_PACKET_MAX];
    unsigned char frame[WEB_DEC_FRAME_MAX];
};
extern struct browser_decoder_mailbox web_decoder;
int web_decoder_enabled(void);
#endif
