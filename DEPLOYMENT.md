# 部署流程

当前公网部署方式：Vite 静态构建，通过 SSH 上传到服务器上的 nginx 子路径。

## 访问地址

- 公网地址：http://47.100.215.224/web-village-war/
- 服务器用户：`deploy`
- 上传目录：`/var/www/web-village-war/`
- nginx 子路径：`/web-village-war/`

## 本地构建

由于站点挂在 nginx 子路径下，构建时必须指定 Vite base：

```powershell
npm run build -- --base=/web-village-war/
```

## 上传

```powershell
scp -i C:\Users\A\.ssh\id_rsa -o BatchMode=yes -o StrictHostKeyChecking=accept-new -r .\dist\* deploy@47.100.215.224:/var/www/web-village-war/
```

## 验证

```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'http://47.100.215.224/web-village-war/' -TimeoutSec 12
Invoke-WebRequest -UseBasicParsing -Uri 'http://47.100.215.224/web-village-war/some/spa/path' -TimeoutSec 12 -Method Head
```

首页、静态资源和 SPA fallback 都应返回 `200`。

## 服务器侧 nginx 约定

服务器 nginx 使用路径前缀转发，不停已有站点，不影响 openclaw。

```nginx
location = /web-village-war {
    return 301 /web-village-war/;
}

location ^~ /web-village-war/ {
    root /var/www;
    index index.html;
    try_files $uri $uri/ /web-village-war/index.html;
}
```

上传目录应允许 `deploy` 写入：

```bash
sudo chown -R deploy:deploy /var/www/web-village-war
```
