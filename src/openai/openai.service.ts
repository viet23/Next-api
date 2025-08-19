import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

@Injectable()
export class OpenaiService {
    private readonly logger = new Logger(OpenaiService.name);

    private readonly endpoint = 'https://api.openai.com/v1/chat/completions';
    private readonly model = 'gpt-5';
    private readonly timeout = 10 * 60 * 1000; // 10 phút

    // Dùng axios instance + interceptors để log thời lượng & request-id
    private readonly http = axios.create({
        baseURL: this.endpoint.replace('/chat/completions', ''),
        timeout: this.timeout,
    });

    constructor() {
        // mark start time
        this.http.interceptors.request.use((config) => {
            (config as any).__startedAt = Date.now();
            return config;
        });

        // log success (ít ồn ào)
        this.http.interceptors.response.use(
            (res) => {
                const started = (res.config as any).__startedAt ?? Date.now();
                const ms = Date.now() - started;
                const rid = res.headers?.['x-request-id'];
                this.logger.debug(`OpenAI OK ${res.status} (${ms}ms) model=${(res.data as any)?.model} reqId=${rid ?? '-'}`);
                return res;
            },
            (error: AxiosError) => {
                const started = (error.config as any)?.__startedAt ?? Date.now();
                (error as any).__durationMs = Date.now() - started;
                throw error;
            },
        );
    }

    /** 🟢 Phân tích targeting → luôn trả JSON array */
    async analyzeTargeting(prompt: string) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new InternalServerErrorException('OPENAI_API_KEY is not set');

        try {
            const { data, headers, status } = await this.http.post('/chat/completions',
                {
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content:
                                'Bạn là máy phân tích targeting. Chỉ trả về JSON HỢP LỆ (DUY NHẤT MỘT MẢNG). Không trả thêm ký tự nào khác.',
                        },
                        { role: 'user', content: prompt },
                    ],
                    // Lưu ý: với các model reasoning, dùng `max_completion_tokens` là hợp lệ (alias của max_tokens). :contentReference[oaicite:0]{index=0}
                    max_completion_tokens: 4000,
                    // Có thể bật định dạng chặt chẽ nếu cần:
                    response_format: { type: 'json_object' },
                },
                {
                    headers: this.buildHeaders(apiKey),
                },
            );

            const raw: string = data?.choices?.[0]?.message?.content ?? '[]';
            const arr = this.coerceToArray(raw);

            return {
                ok: true,
                result: arr,
                raw,
                usage: data?.usage || null,
                model: data?.model ?? this.model,
                requestId: headers['x-request-id'] ?? null,
                status,
            };
        } catch (err: any) {
            this.handleOpenAiError(err, 'analyzeTargeting', { promptLen: prompt?.length });
        }
    }

    /** 🟢 Copywriter → trả plain text */
    /** 🟢 Copywriter → plain text (dùng GPT-4) */
    async rewriteText(prompt: string) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new InternalServerErrorException('OPENAI_API_KEY is not set');

        try {
            const { data, headers, status } = await this.http.post('/chat/completions',
                {
                    model: "gpt-4", // 👈 đổi về GPT-4
                    messages: [
                        {
                            role: 'system',
                            content: 'Bạn là copywriter. Hãy chỉ trả về đoạn nội dung cuối cùng, không kèm giải thích.',
                        },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.4,  // 👈 thêm để output đa dạng hơn 1 chút
                    max_tokens: 4000,   // 👈 GPT-4 dùng max_tokens
                },
                { headers: this.buildHeaders(apiKey) },
            );

            const newText = data?.choices?.[0]?.message?.content?.trim()
                || '【Không tạo được nội dung gợi ý】';

            return {
                ok: true,
                text: newText,
                usage: data?.usage || null,
                model: data?.model ?? "gpt-4",
                requestId: headers['x-request-id'] ?? null,
                status,
            };
        } catch (err: any) {
            this.handleOpenAiError(err, 'rewriteText', { promptLen: prompt?.length });
        }
    }


    /** 🟢 Chấm điểm quảng cáo → JSON array (dùng GPT-4 cho ổn định) */
    async scoreAd(prompt: string) {
        this.logger.debug(`scoreAd prompt len=${prompt?.length}`);

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new InternalServerErrorException('OPENAI_API_KEY is not set');

        try {
            const { data, headers, status } = await this.http.post('/chat/completions',
                {
                    model: "gpt-4", // 👈 đổi về GPT-4
                    messages: [
                        {
                            role: 'system',
                            content: 'Bạn là máy chấm điểm quảng cáo. Chỉ trả về JSON hợp lệ (một MẢNG), không thêm chữ nào khác.',
                        },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0,     // 👈 để output ít "nói lan man"
                    max_tokens: 4000,   // 👈 GPT-4 dùng max_tokens
                },
                { headers: this.buildHeaders(apiKey) },
            );

            const raw: string = data?.choices?.[0]?.message?.content ?? '[]';

            return {
                ok: true,
                result: raw,
                usage: data?.usage || null,
                model: data?.model ?? "gpt-4",
                requestId: headers['x-request-id'] ?? null,
                status,
            };
        } catch (err: any) {
            this.handleOpenAiError(err, 'scoreAd', { promptLen: prompt?.length });
        }
    }


    /** 🟢 Helper: build headers */
    private buildHeaders(apiKey: string) {
        return {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            // Gắn request id của bạn (tự sinh) để dò log đầu-cuối nếu muốn:
            // 'X-Request-Id': crypto.randomUUID(),
        };
    }

    /** 🟢 Helper parse array */
    private coerceToArray(text: any): any[] {
        if (typeof text !== 'string') return [];

        let cleaned = text.trim();
        cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

        const firstBracket = cleaned.indexOf('[');
        const lastBracket = cleaned.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) {
            cleaned = cleaned.slice(firstBracket, lastBracket + 1);
        }

        try {
            const parsed = JSON.parse(cleaned);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
            this.logger.warn(`JSON parse failed, returning [] (len=${cleaned.length})`);
            return [];
        }
    }

    /** 🟢 Sinh nội dung general (GPT-4) */
    async generateText(prompt: any) {

        console.log(`prompt===============`, prompt);

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new InternalServerErrorException('OPENAI_API_KEY is not set');
        }

        try {
            const { data, headers, status } = await this.http.post(
                '/chat/completions',
                {
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    max_tokens: 4000,
                },
                { headers: this.buildHeaders(apiKey) },
            );


            const text =
                data?.choices?.[0]?.message?.content?.trim() ||
                '【Không tạo được nội dung gợi ý】';

            return {
                ok: true,
                text,
                usage: data?.usage || null,
                model: data?.model ?? 'gpt-4',
                requestId: headers['x-request-id'] ?? null,
                status,
            };
        } catch (err: any) {
            this.handleOpenAiError(err, 'generateText', { messagesCount: prompt?.length });
        }
    }

    /** 🟢 Sinh phản hồi đơn giản từ prompt (GPT-4) */
    async simpleChat(prompt: string) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new InternalServerErrorException('OPENAI_API_KEY is not set');

        try {
            const { data, headers, status } = await this.http.post(
                '/chat/completions',
                {
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    max_tokens: 4000,
                },
                { headers: this.buildHeaders(apiKey) },
            );

            const text =
                data?.choices?.[0]?.message?.content?.trim() ||
                '【Không tạo được phản hồi】';

            return {
                ok: true,
                text,
                usage: data?.usage || null,
                model: data?.model ?? 'gpt-4',
                requestId: headers['x-request-id'] ?? null,
                status,
            };
        } catch (err: any) {
            this.handleOpenAiError(err, 'simpleChat', { promptLen: prompt?.length });
        }
    }

    /** 🟢 Simple chat với temperature cao (GPT-4) */
    async creativeChat(prompt: string) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new InternalServerErrorException('OPENAI_API_KEY is not set');

        try {
            const { data, headers, status } = await this.http.post(
                '/chat/completions',
                {
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.9,   // 👈 creative hơn
                    max_tokens: 4000,
                },
                { headers: this.buildHeaders(apiKey) },
            );

            const text =
                data?.choices?.[0]?.message?.content?.trim() ||
                '【Không tạo được phản hồi】';

            return {
                ok: true,
                text,
                usage: data?.usage || null,
                model: data?.model ?? 'gpt-4',
                requestId: headers['x-request-id'] ?? null,
                status,
            };
        } catch (err: any) {
            this.handleOpenAiError(err, 'creativeChat', { promptLen: prompt?.length });
        }
    }

    /** 🟢 Case đặc thù: chấm caption chỉ trả về MỘT CON SỐ (0–100) */
    async scoreCaptionNumber(contentFetchOpportunityScore: string, captionText: string) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new InternalServerErrorException('OPENAI_API_KEY is not set');

        const model = 'gpt-4';

        const messages = [
            { role: 'system', content: contentFetchOpportunityScore },
            {
                role: 'user',
                content: `${captionText}\n\nChấm theo thang 100 điểm. Chỉ trả lời bằng một con số.`,
            },
        ];

        try {
            const { data, headers, status } = await this.http.post(
                '/chat/completions',
                { model, messages, temperature: 0.2, max_tokens: 4000 },
                { headers: this.buildHeaders(apiKey) },
            );

            const text = data?.choices?.[0]?.message?.content?.trim() ?? '';
            const match = text.match(/-?\d+(?:\.\d+)?/);
            const score = match ? Number(match[0]) : null;

            return {
                ok: score !== null,
                score,
                raw: text,
                usage: data?.usage || null,
                model: data?.model ?? model,
                requestId: headers['x-request-id'] ?? null,
                status,
            };
        } catch (err: any) {
            this.handleOpenAiError(err, 'scoreCaptionNumber', {
                contentLen: contentFetchOpportunityScore?.length,
                captionLen: captionText?.length,
            });
        }
    }

    /** 🟢 Dịch & mở rộng prompt sang tiếng Anh */
    async translateAndExpandPrompt(text: string) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new InternalServerErrorException('OPENAI_API_KEY is not set');
        }

        try {
            const { data, headers, status } = await this.http.post(
                '/chat/completions',
                {
                    model: 'gpt-4',
                    messages: [
                        {
                            role: 'user',
                            content: `Translate and expand into detailed English prompt: "${text}"`,
                        },
                    ],
                    temperature: 0.9,
                    max_tokens: 4000,
                },
                { headers: this.buildHeaders(apiKey) },
            );

            const newPrompt =
                data?.choices?.[0]?.message?.content?.trim() ||
                '【Không tạo được prompt】';

            return {
                ok: true,
                prompt: newPrompt,
                usage: data?.usage || null,
                model: data?.model ?? 'gpt-4',
                requestId: headers['x-request-id'] ?? null,
                status,
            };
        } catch (err: any) {
            this.handleOpenAiError(err, 'translateAndExpandPrompt', { textLen: text?.length });
        }
    }

    /** 🟢 Viết caption quảng cáo từ mô tả sản phẩm (system + user) */
    async generateCaptionFromDescription(contentGenerateCaption: string, description: string) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new InternalServerErrorException('OPENAI_API_KEY is not set');

        const model = 'gpt-4'; // hoặc dùng pickModel('gpt-4') nếu bạn đã có helper
        const messages = [
            { role: 'system', content: contentGenerateCaption },
            { role: 'user', content: `Mô tả hình ảnh sản phẩm: "${description}". Hãy viết một caption quảng cáo theo đúng 10 tiêu chí trên.` },
        ];

        try {
            const { data, headers, status } = await this.http.post(
                '/chat/completions',
                { model, messages, temperature: 0.7, max_tokens: 500 },
                { headers: this.buildHeaders(apiKey) },
            );

            const caption =
                data?.choices?.[0]?.message?.content?.trim() || '【Không tạo được caption】';

            return {
                ok: true,
                caption,
                usage: data?.usage || null,
                model: data?.model ?? model,
                requestId: headers['x-request-id'] ?? null,
                status,
            };
        } catch (err: any) {
            this.handleOpenAiError(err, 'generateCaptionFromDescription', {
                sysLen: contentGenerateCaption?.length,
                descLen: description?.length,
            });
        }
    }

    async chatWithPrompt(promptContent: string) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new InternalServerErrorException('OPENAI_API_KEY is not set');

        try {
            const { data, headers, status } = await this.http.post(
                '/chat/completions',
                {
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: promptContent }],
                    temperature: 0.8,
                    max_tokens: 4000,
                },
                { headers: this.buildHeaders(apiKey) },
            );

            const text =
                data?.choices?.[0]?.message?.content?.trim() || '【Không tạo được phản hồi】';

            return {
                ok: true,
                text,
                usage: data?.usage ?? null,
                model: data?.model ?? 'gpt-4',
                requestId: headers?.['x-request-id'] ?? null,
                status,
            };
        } catch (e) {
            const err = e as AxiosError<any>;
            const msg =
                err.response?.data?.error?.message ||
                err.response?.data?.message ||
                err.message ||
                'OpenAI request failed';
            const code = err.response?.status ?? 500;
            if (code === 400) throw new InternalServerErrorException(`OpenAI 400: ${msg}`);
            if (code === 401) throw new InternalServerErrorException('OpenAI 401: Invalid API key');
            if (code === 429) throw new InternalServerErrorException('OpenAI 429: Rate limit/quota');
            throw new InternalServerErrorException(`OpenAI ${code}: ${msg}`);
        }
    }







    /** 🟢 Helper: log & chuẩn hoá lỗi OpenAI */
    private handleOpenAiError(err: any, funcName: string, meta?: Record<string, any>): never {
        // Axios error shape
        const axErr = err as AxiosError<any>;
        const status = axErr.response?.status;
        const data = axErr.response?.data;
        const rid = axErr.response?.headers?.['x-request-id'];
        const durationMs = (axErr as any).__durationMs;

        // Thông điệp từ OpenAI (nếu có)
        const oaiMsg: string | undefined =
            data?.error?.message ?? data?.message ?? axErr.message ?? 'OpenAI request failed';

        // Phân loại một số lỗi mạng phổ biến
        const code = (axErr as any)?.code; // 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'...
        const netHint =
            code === 'ECONNABORTED' ? 'Timeout' :
                code === 'ETIMEDOUT' ? 'Network timeout' :
                    code === 'ENOTFOUND' ? 'DNS not found' :
                        code === 'ECONNRESET' ? 'Socket reset' : undefined;

        // Log chi tiết cho DevOps
        this.logger.error(
            [
                `OpenAI ERROR in ${funcName}`,
                status ? `status=${status}` : '',
                code ? `code=${code}` : '',
                durationMs ? `duration=${durationMs}ms` : '',
                rid ? `reqId=${rid}` : '',
                meta ? `meta=${JSON.stringify(meta)}` : '',
                `msg="${oaiMsg}"`,
            ].filter(Boolean).join(' | '),
        );

        // Map sang HTTP exception cho controller
        if (status === 400) throw new BadRequestException(`OpenAI 400: ${oaiMsg}`);
        if (status === 401) throw new BadRequestException('OpenAI 401: Invalid API key or permissions');
        if (status === 403) throw new BadRequestException('OpenAI 403: Forbidden');
        if (status === 404) throw new BadRequestException('OpenAI 404: Not found (model/endpoint)');
        if (status === 408 || code === 'ECONNABORTED') throw new BadRequestException('OpenAI timeout, thử giảm yêu cầu hoặc tăng timeout');
        if (status === 409) throw new BadRequestException('OpenAI 409: Conflict');
        if (status === 413) throw new BadRequestException('OpenAI 413: Payload quá lớn (vượt context)');
        if (status === 422) throw new BadRequestException('OpenAI 422: Unprocessable entity (tham số sai?)');
        if (status === 429) throw new BadRequestException('OpenAI 429: Rate limit hoặc hết quota');
        if (status === 500) throw new InternalServerErrorException('OpenAI 500: Internal error');
        if (status === 502 || status === 503 || status === 504) {
            throw new InternalServerErrorException(`OpenAI ${status}: Upstream unavailable`);
        }
        if (netHint) throw new InternalServerErrorException(`OpenAI network error: ${netHint}`);
        throw new InternalServerErrorException(`OpenAI error: ${oaiMsg}`);
    }
}
