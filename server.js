const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const config = require('./config');
const { simpleGit } = require('simple-git');
const { parsePatch } = require('diff');

const app = express();
const upload = multer({ dest: 'uploads/' });

// 应用补丁到目标文件
async function applyPatch(targetPath, patch) {
    try {
        // 如果目标文件不存在，创建一个空文件
        if (!fs.existsSync(targetPath)) {
            await fs.ensureFile(targetPath);
            await fs.writeFile(targetPath, '');
        }

        // 读取目标文件内容
        const targetContent = await fs.readFile(targetPath, 'utf-8');
        
        // 解析补丁
        const [filePatch] = parsePatch(patch);
        if (!filePatch) {
            throw new Error('无法解析补丁内容');
        }

        // 应用每个hunks
        let result = targetContent;
        let offset = 0;

        for (const hunk of filePatch.hunks) {
            // 计算实际的起始位置（考虑之前的改动带来的偏移）
            const start = hunk.oldStart - 1;
            
            // 分割文件内容为行
            const lines = result.split('\n');
            
            // 删除旧行
            const removedCount = hunk.oldLines;
            lines.splice(start + offset, removedCount);
            
            // 插入新行
            const newLines = hunk.lines
                .filter(line => line[0] === '+')
                .map(line => line.slice(1));
            lines.splice(start + offset, 0, ...newLines);
            
            // 更新偏移量
            offset += newLines.length - removedCount;
            
            // 重新组合文件内容
            result = lines.join('\n');
        }

        // 写入更新后的内容
        await fs.writeFile(targetPath, result);
        return true;
    } catch (error) {
        console.error('应用补丁失败:', error);
        throw error;
    }
}

// 提供静态文件服务
app.use(express.static(__dirname));

// 提供配置信息的接口
app.get('/config', (req, res) => {
    res.json(config);
});

// 获取暂存区文件列表
app.get('/staged-files', async (req, res) => {
    try {
        const { projectName, sourceLang } = req.query;
        
        if (!projectName || !sourceLang) {
            return res.json({ 
                success: false, 
                message: '缺少项目名称或源语言参数' 
            });
        }

        const projectConfig = config[projectName];
        if (!projectConfig) {
            return res.json({ 
                success: false, 
                message: '项目配置不存在' 
            });
        }

        // 获取源语言域名和项目根目录
        const sourceDomain = projectConfig.lans[sourceLang];
        if (!sourceDomain) {
            return res.json({ 
                success: false, 
                message: `源语言 ${sourceLang} 的配置不存在` 
            });
        }

        // 获取项目根目录并拼接完整路径
        const projectRoot = projectConfig.pathname;
        const projectPath = path.join(projectRoot, sourceDomain);
        
        console.log('Project root path:', projectRoot);
        console.log('Source domain:', sourceDomain);
        console.log('Full project path:', projectPath);

        if (!fs.existsSync(projectPath)) {
            return res.json({ 
                success: false, 
                message: `项目目录不存在: ${projectPath}` 
            });
        }

        const git = simpleGit(projectPath);
        
        // 检查是否是git仓库
        const isRepo = await git.checkIsRepo();
        if (!isRepo) {
            return res.json({ 
                success: false, 
                message: `${projectPath} 不是一个Git仓库` 
            });
        }

        // 获取暂存区文件列表
        const status = await git.status();
        console.log('Git status:', status);

        // 定义允许的路径关键字
        const allowedPaths = ['Dev', 'img', 'lan', 'tpl'];
        
        // 过滤并格式化文件列表
        const stagedFiles = status.staged
            // 过滤包含指定路径关键字的文件
            .filter(file => allowedPaths.some(allowedPath => file.includes(allowedPath)))
            .map(file => ({
                path: file.replace(/\\/g, '/'),
                type: path.extname(file).slice(1)
            }))
            .sort((a, b) => a.path.localeCompare(b.path));

        console.log('Filtered staged files:', stagedFiles);

        if (stagedFiles.length === 0) {
            return res.json({
                success: false,
                message: `暂存区中没有找到符合条件的文件（路径需包含：${allowedPaths.join('、')}）`,
                projectPath,
                sourceDomain
            });
        }

        return res.json({
            success: true,
            files: stagedFiles,
            projectPath,
            sourceDomain
        });
    } catch (error) {
        console.error('获取暂存文件失败:', error);
        return res.json({ 
            success: false, 
            message: `获取暂存文件失败: ${error.message}` 
        });
    }
});

// 同步文件的路由
app.post('/sync', upload.single('sourceFile'), async (req, res) => {
    try {
        const { projectName, sourceLang, relativePath } = req.body;
        const targetLangs = JSON.parse(req.body.targetLangs);

        if (!projectName || !sourceLang || !relativePath || !targetLangs) {
            return res.json({
                success: false,
                message: '缺少必要参数'
            });
        }

        const projectConfig = config[projectName];
        if (!projectConfig) {
            return res.json({
                success: false,
                message: '项目配置不存在'
            });
        }

        // 获取源语言目录
        const sourceDomain = projectConfig.lans[sourceLang];
        if (!sourceDomain) {
            return res.json({
                success: false,
                message: `源语言 ${sourceLang} 的配置不存在`
            });
        }

        // 获取源文件的完整路径
        const sourceDir = path.join(projectConfig.pathname, sourceDomain);
        
        // 检查源目录是否存在
        if (!fs.existsSync(sourceDir)) {
            return res.json({
                success: false,
                message: `源语言目录不存在: ${sourceDir}`
            });
        }

        const git = simpleGit(sourceDir);
        
        // 检查是否是git仓库
        const isRepo = await git.checkIsRepo();
        if (!isRepo) {
            return res.json({
                success: false,
                message: `${sourceDir} 不是一个Git仓库`
            });
        }

        // 获取暂存区的改动
        const diff = await git.diff(['--cached', '--', relativePath]);
        if (!diff) {
            return res.json({
                success: false,
                message: '无法获取暂存区改动'
            });
        }

        // 同步到每个目标语言
        const results = [];
        for (const targetLang of targetLangs) {
            try {
                if (targetLang === sourceLang) {
                    results.push(`跳过源语言 ${targetLang}`);
                    continue;
                }

                const targetDomain = projectConfig.lans[targetLang];
                if (!targetDomain) {
                    results.push(`语言 ${targetLang} 的配置不存在`);
                    continue;
                }

                // 构建目标文件路径
                const targetDir = path.join(projectConfig.pathname, targetDomain);
                const targetPath = path.join(targetDir, relativePath);

                // 确保目标目录存在
                await fs.ensureDir(path.dirname(targetPath));

                // 应用补丁到目标文件
                await applyPatch(targetPath, diff);

                results.push(`成功同步到 ${targetLang}`);
            } catch (error) {
                results.push(`同步到 ${targetLang} 失败: ${error.message}`);
            }
        }

        res.json({
            success: true,
            message: '同步完成',
            results
        });
    } catch (error) {
        res.json({
            success: false,
            message: error.message
        });
    }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({
        success: false,
        error: {
            message: err.message,
            code: err.code || 'UNKNOWN_ERROR'
        }
    });
});

// 启动服务器
function startServer(port) {
    const server = app.listen(port)
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`端口 ${port} 已被占用，尝试端口 ${port + 1}`);
                startServer(port + 1);
            } else {
                console.error('服务器启动失败:', err);
            }
        })
        .on('listening', () => {
            console.log(`服务器运行在 http://localhost:${port}`);
            console.log('请在浏览器中访问上述地址使用代码同步工具');
        });
}

const PORT = process.env.PORT || 3000;
startServer(PORT);
