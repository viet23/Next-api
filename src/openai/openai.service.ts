import { TopcamFb } from '@models/topcam-fb.entity';
import { User } from '@models/user.entity';
import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosError } from 'axios';
import { FacebookAdsService } from 'src/facebook-ads/facebook-ads.service';
import { Repository } from 'typeorm';
import { MoreThanOrEqual } from 'typeorm';
import moment from 'moment';
import { FacebookPost } from '@models/facebook_post.entity';
import { randomUUID } from 'crypto';

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


    constructor(@InjectRepository(User) private readonly userRepo: Repository<User>,
        @InjectRepository(TopcamFb) private readonly topcamFbRepo: Repository<TopcamFb>,
        @InjectRepository(FacebookPost) private readonly repoFacebookPost: Repository<FacebookPost>,
        private readonly fbService: FacebookAdsService) {
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
    async analyzeTargeting(prompt: string, user: User) {
        console.log(`user in analyzeTargeting-------`, user);

        const userData = await this.userRepo
            .createQueryBuilder('user')
            .where('user.email = :email', { email: user?.email })
            .getOne();



        console.log(`userData in analyzeTargeting-------`, userData);
        if (!userData?.accountAdsId || !userData?.accessTokenUser) {
            throw new BadRequestException('User chưa cấu hình Facebook Ads (accountAdsId hoặc accessTokenUser)');
        }

        const dataFacebookPosts = await this.repoFacebookPost
            .createQueryBuilder('p')
            .where(`split_part(p.post_id, '_', 1) = :pageId`, { pageId: userData.idPage })
            .getMany();

            console.log(`dataFacebookPosts in analyzeTargeting-------`, dataFacebookPosts);
            

        // Gom & loại trùng keywords
        const uniqueKeywords = (() => {
            const all = dataFacebookPosts.flatMap(post =>
                Array.isArray(post?.dataTargeting?.keywordsForInterestSearch)
                    ? post.dataTargeting.keywordsForInterestSearch
                    : []
            );
            const cleaned = all.map(k => (k ?? '').trim()).filter(Boolean);
            const firstCaseMap = new Map<string, string>();
            for (const k of cleaned) {
                const lc = k.toLowerCase();
                if (!firstCaseMap.has(lc)) firstCaseMap.set(lc, k);
            }
            return [...firstCaseMap.values()].sort((a, b) => a.localeCompare(b));
        })();

        // Gắn luôn vào phần tử đầu tiên
        if (dataFacebookPosts[0]) {
            dataFacebookPosts[0].dataTargeting = {
                ...(dataFacebookPosts[0].dataTargeting ?? {}),
                keywordsForInterestSearch: uniqueKeywords,
            };
        }

        if (dataFacebookPosts[0]?.dataTargeting?.keywordsForInterestSearch.length > 0) {

            const first = dataFacebookPosts[0]?.dataTargeting ?? {};
            const result = first && Object.keys(first).length ? [first] : [];

            return {
                ok: true,
                result,
                raw: JSON.stringify(result, null, 2), // 👈 giống data 1 (string JSON pretty)
                usage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                    prompt_tokens_details: {
                        cached_tokens: 0,
                        audio_tokens: 0,
                    },
                    completion_tokens_details: {
                        reasoning_tokens: 0,
                        audio_tokens: 0,
                        accepted_prediction_tokens: 0,
                        rejected_prediction_tokens: 0,
                    },
                },
                model: 'gpt-5-2025-08-07',
                requestId: `req_${typeof randomUUID === 'function'
                    ? randomUUID()
                    : Math.random().toString(36).slice(2)}`, // fallback nếu thiếu crypto
                status: 200,
            };
        }


        const todayStart = moment().startOf('day').toDate();
        const now = new Date();

        // kiểm tra đã có dữ liệu update trong ngày chưa
        let topcamData = await this.topcamFbRepo.findOne({
            where: {
                userId: userData?.id,
                updatedAt: MoreThanOrEqual(todayStart),
            },
        });
        let top3Campaigns: any = [];

        if (!topcamData || !topcamData.topCam || (topcamData?.updatedAt < todayStart) || topcamData?.topCam?.length === 0 || topcamData?.topCam?.top3Campaigns?.length === 0 || topcamData?.topCam?.items?.length === 0) {
            const config = {
                apiVersion: 'v19.0',
                adAccountId: userData.accountAdsId,
                accessTokenUser: userData.accessTokenUser,
                cookie: userData.cookie,
            };

            const limit = '200';
            const fields = [
                `id`,
                `name`,
                `adset_id`,
                `campaign_id`,
                `status`,
                `effective_status`,
                `created_time`,
                `updated_time`,
            ];
            const effective_status = [`ACTIVE`, `PAUSED`, `ARCHIVED`];

            console.log(`Fetching top campaigns from Facebook...`, {
                limit: Math.max(1, parseInt(limit, 10)), // mặc định 200
                fields,
                effective_status,
                apiVersion: config.apiVersion,
            },
                config,);


            top3Campaigns = await this.fbService.listAds(
                {
                    limit: Math.max(1, parseInt(limit, 10)), // mặc định 200
                    fields,
                    effective_status,
                    apiVersion: config.apiVersion,
                },
                config,
            );

            console.log(`top3Campaigns-------`, JSON.stringify(top3Campaigns));

            // Nếu record đã tồn tại thì update, nếu chưa thì insert
            topcamData = await this.topcamFbRepo.save({
                ...(topcamData || {}),
                userId: String(userData.id),
                topCam: top3Campaigns,
                updatedAt: now,
                // Ensure required fields are present
                id: topcamData?.id ?? undefined,
                generateBeforInsert: topcamData?.generateBeforInsert ?? null,
                doBeforUpdate: topcamData?.doBeforUpdate ?? null,
                createdAt: topcamData?.createdAt ?? new Date(),
            });
        }

        // return topcamData;

        console.log(`top3Campaigns-------`, JSON.stringify(top3Campaigns));

        const detailedPrompt = `${prompt} Dựa trên các chiến dịch mẫu sau đây: ${JSON.stringify(top3Campaigns)}`


        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new InternalServerErrorException('OPENAI_API_KEY is not set');

        try {
            const { data, headers, status } = await this.http.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-5', // hoặc 'gpt-5-turbo'
                    messages: [
                        {
                            role: 'system',
                            content: `Bạn là máy phân tích targeting. 
Chỉ trả về JSON HỢP LỆ (DUY NHẤT MỘT MẢNG). 
Các key phải viết bằng tiếng Việt có dấu, đúng chính tả. 
Không trả thêm bất kỳ ký tự nào khác.`,
                        },
                        { role: 'user', content: detailedPrompt },
                    ],
                    max_completion_tokens: 4000, // ✅ tham số mới
                },
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                },
            );


            const raw: string = data?.choices?.[0]?.message?.content ?? '[]';
            const arr = this.coerceToArray(raw);

            return {
                ok: true,
                result: arr,
                raw,
                usage: data?.usage || null,
                model: data?.model ?? 'gpt-4',
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
