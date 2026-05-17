# 文件 API

会话级文件系统，为 Agent 提供工作区文件能力。

## 基础路径

```
/web/sessions/:id/user/*
```

## 上传文件

```bash
curl -X PUT /web/sessions/:id/user/path/to/file \
  -H "Content-Type: application/octet-stream" \
  --data-binary @localfile.txt \
  -b cookie.txt
```

## 读取文件

```bash
curl /web/sessions/:id/user/path/to/file \
  -b cookie.txt
```

## 列出目录

```bash
curl /web/sessions/:id/user/ \
  -b cookie.txt
```

## 删除文件

```bash
curl -X DELETE /web/sessions/:id/user/path/to/file \
  -b cookie.txt
```

## iframe 预览

通过 `/ctrl/:sessionId/user/*?preview=true` 可在 iframe 中预览文件，服务端会自动重定向到正确的 API 路径。
