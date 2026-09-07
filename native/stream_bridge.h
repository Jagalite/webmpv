#ifndef WEB_STREAM_BRIDGE_H
#define WEB_STREAM_BRIDGE_H
#include <stdatomic.h>
#include <stdint.h>
#include <mpv/client.h>
#define WEB_IO_CAPACITY 262144
struct web_io_mailbox {
    _Atomic int state, serial, session, epoch, capacity, result, cancelled, interrupt;
    uint64_t offset;
    int64_t total;
    _Atomic int reads, seeks, interruptions, reserved;
    unsigned char data[WEB_IO_CAPACITY];
    int resource;
    int padding;
    int64_t range_start, range_end;
    char url[4096];
};
extern struct web_io_mailbox web_io;
int web_register_stream(mpv_handle *player);
#endif
