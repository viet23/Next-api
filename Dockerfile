FROM  harbor.vpa.com.vn/docker.io/library/node:18 AS builder

ARG REGISTRY_PROXY


WORKDIR /app

COPY package*.json ./

# COPY package*.json yarn.lock ./

RUN npm config set proxy ${REGISTRY_PROXY}

RUN yarn

COPY . .

RUN yarn build

FROM harbor.vpa.com.vn/docker.io/library/node:18 AS production

ENV NODE_ENV=production
ENV TZ=Asia/Ho_Chi_Minh
WORKDIR /app


# RUN yarn
COPY --from=builder /app/package*.json ./
# COPY --from=builder /app/yarn.lock ./  
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/main.js"]