import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import * as crypto from "crypto";

@Injectable()
export class CapiService {
  private readonly logger = new Logger(CapiService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService
  ) {}

  private sha256(str?: string) {
    if (!str) return undefined;
    return crypto.createHash("sha256").update(str).digest("hex");
  }

  private normEmail(email?: string) {
    if (!email) return undefined;
    return email.trim().toLowerCase();
  }

  private normPhone(phone?: string) {
    if (!phone) return undefined;
    return phone.replace(/[^0-9+]/g, "");
  }

  async sendToMeta({
    body,
    clientIp,
    userAgent,
  }: {
    body: any;
    clientIp?: string;
    userAgent?: string;
  }) {
    const pixelId = this.config.get<string>("FB_PIXEL_ID");
    const token = this.config.get<string>("FB_ACCESS_TOKEN");
    const testCode = this.config.get<string>("FB_TEST_EVENT_CODE");
    const graphVer = this.config.get<string>("FB_GRAPH_VERSION") || "v21.0";

    if (!pixelId || !token) {
      this.logger.error("❌ Missing FB_PIXEL_ID or FB_ACCESS_TOKEN in env");
      throw new Error("Missing FB_PIXEL_ID or FB_ACCESS_TOKEN in env");
    }

    this.logger.debug(
      `⚙️ Using CAPI config: pixelId=${pixelId}, graphVer=${graphVer}, testCode=${testCode || "N/A"}`
    );

     this.logger.debug(
      `⚙️ Using CAPI config: body?.user_data?.email=${body?.user_data?.email}, body?.user_data?.phone=${body?.user_data?.phone}|| "N/A"}`
    );

    // Hash user identifiers
    const emHash = this.sha256(this.normEmail(body?.user_data?.email));
    const phHash = this.sha256(this.normPhone(body?.user_data?.phone));

    const payload = {
      data: [
        {
          event_name: body.event_name,
          event_time: body.event_time,
          action_source: body.action_source || "website",
          event_id: body.event_id,
          event_source_url: body.event_source_url,
          user_data: {
            em: emHash ? [emHash] : undefined,
            ph: phHash ? [phHash] : undefined,
            fbp: body.fbp || undefined,
            fbc: body.fbc || undefined,
            client_ip_address: clientIp || undefined,
            client_user_agent: userAgent || undefined,
          },
          custom_data: body.custom_data || undefined,
          attribution_data: body.attribution_data || undefined,
        },
      ],
      ...(testCode ? { test_event_code: testCode } : {}),
    };

    this.logger.debug(
      `📤 Sending payload to Meta: ${JSON.stringify(
        {
          ...payload,
          data: payload.data.map((d) => ({
            ...d,
            user_data: {
              ...d.user_data,
              em: d.user_data?.em ? ["***hashed***"] : undefined,
              ph: d.user_data?.ph ? ["***hashed***"] : undefined,
            },
          })),
        },
        null,
        2
      )}`
    );

    try {
      const url = `https://graph.facebook.com/${graphVer}/${pixelId}/events?access_token=${token}`;
      const res = await this.http.axiosRef.post(url, payload, { timeout: 10000 });

      this.logger.log(`✅ Meta CAPI response: ${JSON.stringify(res.data)}`);
      return res.data;
    } catch (err: any) {
      const detail = err?.response?.data || err.message;
      this.logger.error(`❌ Meta CAPI error: ${JSON.stringify(detail)}`);
      throw err;
    }
  }
}
