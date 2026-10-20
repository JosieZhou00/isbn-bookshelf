// 本文件封装手机相机扫码，优先使用 BarcodeDetector，并以固定版本 ZXing 兜底。
import { isValidIsbn, normalizeIsbn } from "./utils.js";

const ZXING_MODULE_URL = "https://esm.sh/@zxing/browser@0.1.5";

export class CameraScanner {
  // 创建扫码器并保存界面节点和识别回调。
  constructor({ dialog, video, hint, onResult }) {
    this.dialog = dialog;
    this.video = video;
    this.hint = hint;
    this.onResult = onResult;
    this.stream = null;
    this.timer = null;
    this.detector = null;
    this.zxingControls = null;
  }

  // 打开后置摄像头并选择浏览器支持的识别方式。
  async start() {
    this.ensureCameraAvailable();
    this.dialog.showModal();
    if ("BarcodeDetector" in window) {
      await this.startNativeScanner();
      return;
    }
    await this.startZxingScanner();
  }

  // 检查页面是否满足 HTTPS 和相机 API 要求。
  ensureCameraAvailable() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前页面不能访问相机。请使用 HTTPS 地址，或改为手动输入 ISBN。");
    }
  }

  // 使用浏览器原生 BarcodeDetector 识别 EAN-13 和 UPC-A。
  async startNativeScanner() {
    this.detector = new BarcodeDetector({ formats: ["ean_13", "upc_a"] });
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.scanLoop();
  }

  // 动态加载 ZXing，在不支持 BarcodeDetector 的浏览器中识别条码。
  async startZxingScanner() {
    this.hint.textContent = "正在加载兼容扫码组件，请稍等。";
    const { BrowserMultiFormatReader } = await import(ZXING_MODULE_URL);
    const reader = new BrowserMultiFormatReader();
    this.zxingControls = await reader.decodeFromVideoDevice(undefined, this.video, (result) => this.acceptResult(result?.getText()));
    this.hint.textContent = "请把 ISBN 条码放到取景框中。";
  }

  // 校验识别结果，只把有效 ISBN 交给界面。
  acceptResult(rawValue) {
    const isbn = normalizeIsbn(rawValue);
    if (!isValidIsbn(isbn)) return;
    this.onResult(isbn);
    this.stop();
  }

  // 停止识别并释放相机轨道。
  stop() {
    clearTimeout(this.timer);
    this.zxingControls?.stop();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.video.srcObject = null;
    this.stream = null;
    this.zxingControls = null;
    if (this.dialog.open) this.dialog.close();
  }

  // 循环检测原生视频画面中的条码。
  async scanLoop() {
    if (!this.stream) return;
    try {
      const codes = await this.detector.detect(this.video);
      const rawValue = codes?.[0]?.rawValue;
      if (rawValue) this.acceptResult(rawValue);
      this.hint.textContent = "正在识别，请把条码放到画面中央。";
    } catch (error) {
      this.hint.textContent = `识别遇到问题：${error.message}`;
    }
    if (this.stream) this.timer = setTimeout(() => this.scanLoop(), 360);
  }
}
