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

interface ParseResult {
  success: boolean
  data?: Record<string, string>
  error?: string
}

/**
 * 使用豆包大模型解析自然语言输入
 */
export async function parseWithDoubao(
  text: string,
  fields: Array<{ id: string; name: string; key?: string }>,
): Promise<ParseResult> {
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
- 商品名称
- 数量（包含单位，如：5斤、10kg、3包等）
- ${fieldDescriptions}

要求：
1. 车牌号支持多种格式：完整车牌（如川A12345）、尾号（如1234）、简称（如川A）
2. 数量要保留单位
3. 如果某个字段没有提到，就不要返回
4. 只返回 JSON 格式，不要其他文字

返回格式示例：
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
        
        const textContent = messageOutput.content.find((c: any) => c.type === 'text')
        console.log('找到的 textContent:', textContent)
        content = textContent?.text || ''
      }
    }

    if (!content) {
      console.error('未找到响应内容:', result)
      return { success: false, error: '未获取到解析结果' }
    }
    
    console.log('提取的文本内容:', content)

    // 解析 JSON
    let parsed: Record<string, string>
    try {
      // 提取 JSON（可能包含在 markdown 代码块中）
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return { success: false, error: '无法解析返回结果' }
      }
      parsed = JSON.parse(jsonMatch[0])
    } catch (e) {
      console.error('JSON 解析失败:', content)
      return { success: false, error: '解析结果格式错误' }
    }

    // 映射字段名到字段 ID
    const mappedData: Record<string, string> = {}
    
    for (const field of fields) {
      if (parsed[field.name]) {
        mappedData[field.id] = parsed[field.name]
      }
    }

    // 特殊处理商品和数量
    if (productField && parsed['商品']) {
      mappedData[productField.id] = parsed['商品']
    }
    if (quantityField && parsed['数量']) {
      mappedData[quantityField.id] = parsed['数量']
    }

    return {
      success: true,
      data: mappedData,
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

