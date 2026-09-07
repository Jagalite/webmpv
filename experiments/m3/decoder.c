// Standalone measurement ABI; never linked into the production mpv engine.
#include <emscripten.h>
#include <libavcodec/avcodec.h>
#include <libavutil/imgutils.h>
#include <libswscale/swscale.h>
#include <stdint.h>

static AVCodecContext *decoder;
static AVFrame *frame;
static struct SwsContext *scaler;
static uint8_t *rgba;
static uint8_t *planar;
static int width, height;

EMSCRIPTEN_KEEPALIVE void bench_close(void)
{
    avcodec_free_context(&decoder);
    av_frame_free(&frame);
    sws_freeContext(scaler); scaler = NULL;
    av_freep(&rgba);
    av_freep(&planar);
}
EMSCRIPTEN_KEEPALIVE int bench_init(uint8_t *extra, int size, int w, int h)
{
    bench_close();
    if (w < 1 || h < 1 || w > 1920 || h > 1080 || size < 1) return -1;
    width = w; height = h;
    decoder = avcodec_alloc_context3(avcodec_find_decoder(AV_CODEC_ID_H264));
    frame = av_frame_alloc();
    rgba = av_malloc((size_t)w * h * 4);
    planar = av_malloc((size_t)w * h * 3 / 2);
    if (!decoder || !frame || !rgba || !planar) return -2;
    decoder->extradata = av_mallocz(size + AV_INPUT_BUFFER_PADDING_SIZE);
    if (!decoder->extradata) return -2;
    memcpy(decoder->extradata, extra, size);
    decoder->extradata_size = size;
    decoder->thread_count = 2;
    decoder->thread_type = FF_THREAD_FRAME | FF_THREAD_SLICE;
    decoder->pkt_timebase = (AVRational){1, 1000000};
    return avcodec_open2(decoder, decoder->codec, NULL);
}
EMSCRIPTEN_KEEPALIVE int bench_send(uint8_t *data, int size, double pts, double dts)
{
    if (!size) return avcodec_send_packet(decoder, NULL);
    AVPacket *packet = av_packet_alloc();
    if (!packet) return -1;
    int ret = av_new_packet(packet, size);
    if (ret >= 0) {
        memcpy(packet->data, data, size);
        packet->pts = (int64_t)pts; packet->dts = (int64_t)dts;
        ret = avcodec_send_packet(decoder, packet);
    }
    av_packet_free(&packet);
    return ret;
}
EMSCRIPTEN_KEEPALIVE int bench_receive(void)
{
    int ret = avcodec_receive_frame(decoder, frame);
    if (ret == AVERROR(EAGAIN)) return 0;
    if (ret == AVERROR_EOF) return 2;
    if (ret < 0) return ret;
    if (frame->width != width || frame->height != height ||
        frame->format != AV_PIX_FMT_YUV420P) return -1;
    return 1;
}
EMSCRIPTEN_KEEPALIVE double bench_pts(void) { return (double)frame->pts; }
static uintptr_t convert(const uint8_t * const planes[], const int strides[], enum AVPixelFormat format)
{
    scaler = sws_getCachedContext(scaler, width, height, format,
        width, height, AV_PIX_FMT_RGBA, SWS_FAST_BILINEAR, NULL, NULL, NULL);
    if (!scaler) return 0;
    const int *coeff = sws_getCoefficients(SWS_CS_ITU709);
    if (sws_setColorspaceDetails(scaler, coeff, 0, coeff, 1, 0, 1 << 16, 1 << 16) < 0) return 0;
    uint8_t *out[] = {rgba}; int out_stride[] = {width * 4};
    if (sws_scale(scaler, planes, strides, 0, height, out, out_stride) != height) return 0;
    return (uintptr_t)rgba;
}
EMSCRIPTEN_KEEPALIVE uintptr_t bench_rgba(void)
{
    return convert((const uint8_t * const *)frame->data, frame->linesize, AV_PIX_FMT_YUV420P);
}
EMSCRIPTEN_KEEPALIVE uintptr_t bench_i420(uint8_t *data)
{
    const uint8_t *planes[] = {data, data + width * height, data + width * height * 5 / 4};
    int strides[] = {width, width / 2, width / 2};
    return convert(planes, strides, AV_PIX_FMT_YUV420P);
}
EMSCRIPTEN_KEEPALIVE uintptr_t bench_nv12(uint8_t *data)
{
    // Normalize chroma layout so both paths use exactly the same scaler kernel.
    int luma = width * height;
    memcpy(planar, data, luma);
    for (int i = 0; i < luma / 4; i++) {
        planar[luma + i] = data[luma + 2 * i];
        planar[luma + luma / 4 + i] = data[luma + 2 * i + 1];
    }
    return bench_i420(planar);
}
EMSCRIPTEN_KEEPALIVE void bench_reset(void) { avcodec_flush_buffers(decoder); }
