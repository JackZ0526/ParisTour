import { createCopy } from '../copyFactory'
export const en = {
  "md515aa08ae": "Could not decode the image",
  "mf1844fd87b": "Could not create an image canvas",
  "m51c1dd58a9": "Please select a valid image file (JPG / PNG / WebP)",
  "mbcaea6243a": "Failed to read image file",
  "mc24a80ece6": "Image data is empty"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "md515aa08ae": "解析图片失败",
  "mf1844fd87b": "无法创建图像画布上下文",
  "m51c1dd58a9": "请选择有效的图片文件 (JPG / PNG / WebP)",
  "mbcaea6243a": "读取图片文件失败",
  "mc24a80ece6": "图片数据为空"
}
export const runtimeCopy = createCopy(en, zhCN)
