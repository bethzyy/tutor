FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Proxy API to backend
RUN echo 'server { \
    listen 80; \
    location / { root /usr/share/nginx/html; try_files $uri $uri/ /index.html; } \
    location /api { proxy_pass http://backend:3001; proxy_set_header Host $host; } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
