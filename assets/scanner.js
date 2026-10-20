// 本文件封装手机相机扫码，优先使用 BarcodeDetector，并以固定版本 ZXing 兜底。
import { isValidIsbn, normalizeIsbn } from "./utils.js?v=11";
import { t } from "./i18n.js?v=11";

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
      throw new Error(t("scanner.unavailable"));
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
    this.hint.textContent = t("scanner.loading");
    const { BrowserMultiFormatReader } = await import(ZXING_MODULE_URL);
    const reader = new BrowserMultiFormatReader();
    this.zxingControls = await reader.decodeFromVideoDevice(undefined, this.video, (result) => this.acceptResult(result?.getText()));
    this.hint.textContent = t("scanner.position");
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
      this.hint.textContent = t("scanner.scanning");
    } catch (error) {
      this.hint.textContent = t("scanner.error", { message: error.message });
    }
    if (this.stream) this.timer = setTimeout(() => this.scanLoop(), 360);
  }

  // 在语言切换时刷新当前扫描提示。
  updateLanguage() {
    this.hint.textContent = this.stream || this.zxingControls ? t("scanner.scanning") : t("scanner.position");
  }
}
