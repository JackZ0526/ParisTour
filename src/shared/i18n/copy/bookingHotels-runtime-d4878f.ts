import { createCopy } from '../copyFactory'
export const en = {
  "m05abf0e9d8": "Staff",
  "m4c998bdd54": "Facilities",
  "m7e4ff80569": "Cleanliness",
  "mce0b67644a": "Comfort",
  "mbfa23313cf": "Value for money",
  "m88c34452cc": "Location",
  "mdde55047e7": "Free Wi-Fi",
  "mcc13bb1556": "Breakfast",
  "m35380449b6": "Walkability",
  "m071b0db316": "Minimum check-in age: {p0}",
  "me1883c6861": "Pets are not allowed",
  "mf2cf894b2a": "This property does not accept cash",
  "ma56d755891": "Pet policy: {p0}",
  "m98e7e5af9c": "The guest left no positive comments"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m05abf0e9d8": "员工服务",
  "m4c998bdd54": "设施服务",
  "m7e4ff80569": "清洁程度",
  "mce0b67644a": "舒适程度",
  "mbfa23313cf": "性价比",
  "m88c34452cc": "位置",
  "mdde55047e7": "免费 Wi-Fi",
  "mcc13bb1556": "早餐",
  "m35380449b6": "步行便利",
  "m071b0db316": "最低入住年龄：{p0} 岁",
  "me1883c6861": "不允许携带宠物",
  "mf2cf894b2a": "住宿不接受现金付款",
  "ma56d755891": "宠物政策：{p0}",
  "m98e7e5af9c": "住客未填写正面评价"
}
export const runtimeCopy = createCopy(en, zhCN)
