/**
 * 豆包大模型智能解析
 * 官网：https://www.volcengine.com/product/doubao
 * 文档：https://www.volcengine.com/docs/82379/1494384
 * 模型：Doubao-Seed-2.0-mini (多模态模型，支持图片识别)
 */

const DOUBAO_CONFIG = {
  // API Key
  API_KEY: 'ark-25b50394-dbbc-444c-8500-bebb1b1d3acb-f0401',
  // 模型名称
  MODEL: 'doubao-seed-2-0-mini-260215',
  // API 端点 (多模态 API)
  ENDPOINT: 'https://ark.cn-beijing.volces.com/api/v3/responses',
}

/** 智能识别得到的多行商品（每行对应表单一行） */
export type DoubaoProductLine = { product: string; quantity: string }

export interface DoubaoParseResult {
  success: boolean
  data?: Record<string, string>
  /** 多商品时每行一对；单商品时可为 1 条或与 data 首行一致 */
  productLines?: DoubaoProductLine[]
  error?: string
}

/** 顿号/逗号拆分「红薯、白薯」与「100斤、15斤」为两行（段数一致时） */
function splitLegacyListStrings(
  productStr: string,
  qtyStr: string,
): DoubaoProductLine[] {
  const splitSeg = (s: string) =>
    s
      .split(/[、,，]/)
      .map((x) => x.trim())
      .filter(Boolean)
  const products = splitSeg(productStr)
  const qtys = splitSeg(qtyStr)
  if (products.length !== qtys.length || products.length <= 1) return []
  return products.map((product, i) => ({
    product,
    quantity: qtys[i] ?? '',
  }))
}

/**
 * 使用豆包大模型解析自然语言输入
 */
export async function parseWithDoubao(
  text: string,
  fields: Array<{ id: string; name: string; key?: string }>,
): Promise<DoubaoParseResult> {
  if (!isDoubaoConfigured()) {
    return {
      success: false,
      error: '请先配置豆包 API Key',
    }
  }

  try {
    // 构建字段说明
    const fieldDescriptions = fields
      .filter((f) => f.key !== 'product' && f.key !== 'quantity')
      .map((f) => f.name)
      .join('、')

    const productField = fields.find((f) => f.key === 'product')
    const quantityField = fields.find((f) => f.key === 'quantity')

    // 构建提示词
    const prompt = `你是一个记账助手，需要从用户的自然语言输入中提取结构化信息。

用户输入：${text}

请提取以下信息（如果有的话）：
- 多种不同商品时：每一项单独一行（见下方「商品明细」数组）
- 单一商品时：也可用一行商品+数量
- 公共信息：${fieldDescriptions || '（无额外自定义字段）'}

要求：
1. 车牌号支持多种格式：完整车牌（如川A12345）、尾号（如1234）、简称（如川A）
2. 数量要保留单位；每一种商品对应自己的数量，不可混写串台
3. **若用户一次提到多种不同商品（如「红薯100斤白薯15斤」），必须使用「商品明细」数组，每项一条；禁止把多种商品压成一个字符串用顿号连接**
4. 如果某个字段没有提到，就不要返回
5. 只返回 JSON 格式，不要其他文字

多商品返回示例：
{
  "商品明细": [
    { "商品": "红薯", "数量": "100斤" },
    { "商品": "白薯", "数量": "15斤" }
  ],
  "车牌号": "京A8899"
}

单商品返回示例（任选其一）：
{
  "商品明细": [ { "商品": "苹果", "数量": "5斤" } ],
  "车牌号": "川A12345"
}
或
{
  "商品": "苹果",
  "数量": "5斤",
  "车牌号": "川A12345",
  "金额": "50"
}`

    console.log('调用豆包 API，模型:', DOUBAO_CONFIG.MODEL)
    
    // 调用豆包 API (多模态格式)
    const response = await fetch(DOUBAO_CONFIG.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DOUBAO_CONFIG.API_KEY}`,
      },
      body: JSON.stringify({
        model: DOUBAO_CONFIG.MODEL,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText }
      }
      console.error('豆包 API 错误:', response.status, errorData)
      
      if (response.status === 401) {
        return { success: false, error: 'API Key 无效，请检查配置' }
      } else if (response.status === 404) {
        return { success: false, error: '推理接入点不存在或未激活，请检查配置' }
      } else if (response.status === 429) {
        return { success: false, error: '请求过于频繁，请稍后再试' }
      } else {
        return { success: false, error: `API 错误 ${response.status}: ${errorData.message || '未知错误'}` }
      }
    }

    const result = await response.json()
    console.log('豆包 API 响应:', result)
    
    // 多模态 API 的响应格式：result.output 是一个数组
    // 需要找到 type 为 'message' 的项，然后从 content 中提取文本
    let content = ''
    if (result.output && Array.isArray(result.output)) {
      // 找到 type 为 'message' 的项
      const messageOutput = result.output.find((item: any) => item.type === 'message')
      console.log('找到的 messageOutput:', messageOutput)
      
      // 从 message 的 content 数组中提取文本
      if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content)) {
        console.log('content 数组:', messageOutput.content)
        messageOutput.content.forEach((c: any, index: number) => {
          console.log('content[' + index + ']:', c)
        })
        
        /** Responses API 多为 output_text；旧版可能是 text */
        const textBlock = messageOutput.content.find(
          (c: any) => c.type === 'text' || c.type === 'output_text',
        )
        console.log('找到的文本块:', textBlock)
        content =
          (typeof textBlock?.text === 'string' ? textBlock.text : '') ||
          (typeof textBlock?.textContent === 'string'
            ? textBlock.textContent
            : '') ||
          ''
      }
    }

    if (!content) {
      console.error('未找到响应内容:', result)
      return { success: false, error: '未获取到解析结果' }
    }
    
    console.log('提取的文本内容:', content)

    // 解析 JSON（整段里第一个完整的 {...} 对象）
    let parsed: Record<string, unknown>
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return { success: false, error: '无法解析返回结果' }
      }
      parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    } catch (e) {
      console.error('JSON 解析失败:', content)
      return { success: false, error: '解析结果格式错误' }
    }

    const rawDetail =
      parsed['商品明细'] ?? parsed['商品列表'] ?? parsed['line_items']
    let productLines: DoubaoProductLine[] | undefined

    if (Array.isArray(rawDetail) && rawDetail.length > 0) {
      productLines = rawDetail
        .map((row: unknown) => {
          if (row && typeof row === 'object' && !Array.isArray(row)) {
            const o = row as Record<string, unknown>
            return {
              product: String(o['商品'] ?? o['名称'] ?? '').trim(),
              quantity: String(o['数量'] ?? '').trim(),
            }
          }
          return { product: '', quantity: '' }
        })
        .filter((r) => r.product && r.quantity)
    }

    const flatProduct = String(parsed['商品'] ?? '').trim()
    const flatQty = String(parsed['数量'] ?? '').trim()

    if (!productLines || productLines.length === 0) {
      const split = splitLegacyListStrings(flatProduct, flatQty)
      if (split.length > 0) {
        productLines = split
      } else if (flatProduct && flatQty) {
        productLines = [{ product: flatProduct, quantity: flatQty }]
      }
    }

    // 映射字段名到字段 ID（不含商品/数量多行，稍后单独写）
    const mappedData: Record<string, string> = {}

    for (const field of fields) {
      if (field.key === 'product' || field.key === 'quantity') continue
      const v = parsed[field.name]
      if (v !== undefined && v !== null && String(v).trim()) {
        mappedData[field.id] = String(v).trim()
      }
    }

    if (productLines && productLines.length > 0) {
      if (productField) {
        mappedData[productField.id] = productLines[0].product
      }
      if (quantityField) {
        mappedData[quantityField.id] = productLines[0].quantity
      }
    }

    return {
      success: true,
      data: mappedData,
      productLines,
    }
  } catch (error: any) {
    console.error('豆包解析错误:', error)
    return {
      success: false,
      error: error.message || '网络错误',
    }
  }
}

/**
 * 检查是否配置了豆包 API Key
 */
export function isDoubaoConfigured(): boolean {
  return (
    DOUBAO_CONFIG.API_KEY !== 'your_api_key_here' &&
    DOUBAO_CONFIG.API_KEY.length > 0
  )
}

