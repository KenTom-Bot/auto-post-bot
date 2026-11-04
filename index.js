const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

// ================= 1. CẤU HÌNH CƠ BẢN =================
const SPREADSHEET_ID = 'ĐIỀN_ID_BẢNG_TÍNH_VÀO_ĐÂY';
const SHEET_NAME = 'Trang tính1'; 

// ================= 2. TỪ ĐIỂN TÀI KHOẢN =================
const ACCOUNTS = {
    'FB - Cafe Số': { 
        type: 'FACEBOOK', 
        id: '510347025492019', 
        token: 'EAAQygEX3PaQBS93jZBW1vZB12TG79fQBcap3UkXZBPUqaDbFyDZBPl9ekhPyIzlpsIZC9gt7BFkGJz6rtK31s4vPdpGogOUiseKEWSGY7iKKAPPSEhDEynYMNQ3ZA3jHERv5E2ZBVDDZCy3SYgKx3NZBV1ZCZAm2x3aCAqQlgdqRegFmGU7GBBlrs0ZCzQQZCyfYFG8vLxj39PDVgJ6FlixcZBS3LXbTcD1SZCz0Ox3Wggz0dyx5tXbSpTYbvagkmTD' 
    },
    'YT - Kênh Chính': { 
        type: 'YOUTUBE', 
        clientId: 'ĐIỀN_CLIENT_ID', 
        clientSecret: 'ĐIỀN_CLIENT_SECRET', 
        refreshToken: 'ĐIỀN_REFRESH_TOKEN' 
    }
};

const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

function parseDateStringVN(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.trim().split(' ');
    if (parts.length !== 2) return null;
    const [day, month, year] = parts[0].split('/');
    const time = parts[1];
    return new Date(`${year}-${month}-${day}T${time}:00+07:00`);
}

async function kiemTraVaDangBai() {
    console.log('🔄 Đang kiểm tra lịch đăng...');
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const now = new Date(); 

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:H100`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) return console.log('Không có dữ liệu.');

        for (let i = 0; i < rows.length; i++) {
            const [thoiGian, loaiBai, nenTang, tieuDe, noiDung, linkDrive, linkAffiliate, trangThai] = rows[i] || [];

            if (!trangThai || !trangThai.includes('Đã đăng')) {
                const scheduledTime = parseDateStringVN(thoiGian);
                if (!scheduledTime || now < scheduledTime) continue; 

                let finalCaption = noiDung || '';
                if (linkAffiliate) finalCaption += `\n\n👉 Mua ngay: ${linkAffiliate}`;

                const accountConfig = ACCOUNTS[nenTang ? nenTang.trim() : ''];
                
                if (accountConfig) {
                    try {
                        console.log(`-> Đang xử lý ${loaiBai} cho ${nenTang}...`);
                        const arrLinks = linkDrive ? linkDrive.split(',').map(l => l.trim()).filter(l => l) : [];
                        
                        // ===== XỬ LÝ FACEBOOK =====
                        if (accountConfig.type === 'FACEBOOK') {
                            if (loaiBai === 'Text') {
                                await dangBaiTextFacebook(finalCaption, accountConfig.id, accountConfig.token);
                            } else {
                                if (arrLinks.length === 0) throw new Error('Không có link Drive');
                                if (loaiBai === 'Video' || arrLinks.length === 1) {
                                    const ext = loaiBai === 'Image' ? '.jpg' : '.mp4';
                                    const tempFilePath = path.join(__dirname, `temp_${Date.now()}${ext}`);
                                    await downloadFileDrive(arrLinks[0], tempFilePath);
                                    
                                    if (loaiBai === 'Image') await dangBaiImageFacebook(finalCaption, tempFilePath, accountConfig.id, accountConfig.token);
                                    else await dangBaiVideoFacebook(finalCaption, tempFilePath, accountConfig.id, accountConfig.token);
                                    
                                    fs.unlinkSync(tempFilePath);
                                } else if (loaiBai === 'Image' && arrLinks.length > 1) {
                                    const mediaIds = [];
                                    const downloadedFiles = [];
                                    for (let j = 0; j < arrLinks.length; j++) {
                                        const tempFilePath = path.join(__dirname, `temp_multi_${Date.now()}_${j}.jpg`);
                                        await downloadFileDrive(arrLinks[j], tempFilePath);
                                        downloadedFiles.push(tempFilePath);
                                        const photoId = await dangAnhAnFacebook(tempFilePath, accountConfig.id, accountConfig.token);
                                        mediaIds.push(photoId);
                                    }
                                    await dangNhieuAnhFacebook(finalCaption, mediaIds, accountConfig.id, accountConfig.token);
                                    downloadedFiles.forEach(file => fs.unlinkSync(file));
                                }
                            }
                        } 
                        // ===== XỬ LÝ YOUTUBE =====
                        else if (accountConfig.type === 'YOUTUBE' && loaiBai === 'Video') {
                            if (arrLinks.length === 0) throw new Error('Không có link Drive');
                            const tempFilePath = path.join(__dirname, `temp_yt_${Date.now()}.mp4`);
                            await downloadFileDrive(arrLinks[0], tempFilePath);
                            
                            const oauth2Client = new google.auth.OAuth2(accountConfig.clientId, accountConfig.clientSecret);
                            oauth2Client.setCredentials({ refresh_token: accountConfig.refreshToken });
                            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
                            
                            await youtube.videos.insert({
                                part: 'snippet,status',
                                requestBody: {
                                    snippet: { title: tieuDe || 'Video', description: finalCaption },
                                    status: { privacyStatus: 'public' }
                                },
                                media: { body: fs.createReadStream(tempFilePath) }
                            });
                            fs.unlinkSync(tempFilePath);
                        }

                        // Cập nhật Sheets
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID,
                            range: `${SHEET_NAME}!H${i + 2}`,
                            valueInputOption: 'USER_ENTERED',
                            resource: { values: [['Đã đăng']] },
                        });
                        console.log(`✅ Hoàn tất lên ${nenTang}`);
                    } catch (err) {
                        console.error(`❌ Lỗi ${nenTang}:`, err.message);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Lỗi hệ thống:', error.message);
    }
}

// ===== CÁC HÀM TIỆN ÍCH =====
async function downloadFileDrive(driveLink, destPath) {
    const fileIdMatch = driveLink.match(/[-\w]{25,}/);
    if (!fileIdMatch) throw new Error('Link Drive không hợp lệ');
    const directUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[0]}`;
    const writer = fs.createWriteStream(destPath);
    const response = await axios({ url: directUrl, method: 'GET', responseType: 'stream' });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}
async function dangBaiTextFacebook(message, pageId, pageToken) {
    await axios.post(`https://graph.facebook.com/v18.0/${pageId}/feed`, null, { params: { message, access_token: pageToken }});
}
async function dangBaiImageFacebook(message, filePath, pageId, pageToken) {
    const form = new FormData(); form.append('message', message); form.append('access_token', pageToken); form.append('source', fs.createReadStream(filePath));
    await axios.post(`https://graph.facebook.com/v18.0/${pageId}/photos`, form, { headers: form.getHeaders() });
}
async function dangBaiVideoFacebook(message, filePath, pageId, pageToken) {
    const form = new FormData(); form.append('description', message); form.append('access_token', pageToken); form.append('source', fs.createReadStream(filePath));
    await axios.post(`https://graph.facebook.com/v18.0/${pageId}/videos`, form, { headers: form.getHeaders() });
}
async function dangAnhAnFacebook(filePath, pageId, pageToken) {
    const form = new FormData(); form.append('published', 'false'); form.append('access_token', pageToken); form.append('source', fs.createReadStream(filePath));
    const res = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/photos`, form, { headers: form.getHeaders() }); return res.data.id;
}
async function dangNhieuAnhFacebook(message, mediaIds, pageId, pageToken) {
    const params = { message, access_token: pageToken };
    mediaIds.forEach((id, index) => { params[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id }); });
    await axios.post(`https://graph.facebook.com/v18.0/${pageId}/feed`, null, { params });
}

kiemTraVaDangBai();
