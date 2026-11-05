const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

// ================= 1. CẤU HÌNH CƠ BẢN =================
const SPREADSHEET_ID = '1wr6WHUF3i8U0b-BVv0AVw5JjfT9ojOwtzqf41tVdjrw';
const SHEET_NAME = 'Trang tính1'; 

// ================= 2. TỪ ĐIỂN TÀI KHOẢN =================
const ACCOUNTS = {
    'FB - Cafe Số': { 
        type: 'FACEBOOK', 
        id: '510347025492019', 
        token: 'EAAQygEX3PaQBSzXqNA7aDN5TSzIGoZBtxi2DI3zC0UNZBD6qArpR4VWGlPeBQxZCmcqFHwWpCZA7AAbc9IkBbT7FZCGNmyNymK3KYgH9F7bQZCEHP4L7c2BJs2ALsF7bBOsPeZCwdK1YqycxQuWZCMKCJpMQUjyQspdiWmoigHe8RA5ZAaMonoZBJsKTQGoEAl2IMIxizDXBDZAfQCSMNhBtqXdmZCM0' 
    },
    'FB - Thế Giới Trẻ Thơ': { 
        type: 'FACEBOOK', 
        id: '108894505424425', 
        token: 'EAAQygEX3PaQBS6AZBJEH8SPvyqjirG6f63FSdCHPCgDim5mFRXDh7QbNjDdbHN15CDGjOcARBkpEM8nm4BpzW5FJZAZCl27CTmeRBDnzh8tKgfMvXyVADwZAaBZAlzERy8b1nb3GIfLaQSjSHhCifKHFZAqbmvZAtdaGxjnYHVNxCtN1Ym3wwduslz6RACKeHXvnha4FZBFgaLRfJ34LOSFCpZBUZD' 
    },
    'FB - Tiện ích hàng ngày': { 
        type: 'FACEBOOK', 
        id: '109253124911604', 
        token: 'EAAQygEX3PaQBSxdBqZBEhkHkUW7N6Pxcsf0ZBopWuX94LMPBbI86m9O9bwDhNdDMyiUyrcFnmIMaLZCIhzVU2zsX1isYgCboExI8yfnxnZBixdvfnwmyofQSk901Ndkf5GBeQAVVTKJebF5KohncTlGA1G53ZBmrHb2jpU1O56neh8Vm8eXroXgTztV8V4HrDZBFJefHc7OAj1NwbzxFxZBe2sZD' 
    },
    'YT - Cafe Số': { 
        type: 'YOUTUBE', 
        clientId: '5800787278-1kvg105bh2g15vred661h93imrh4kiuq.apps.googleusercontent.com', 
        clientSecret: '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', 
        refreshToken: '1//04sAqFrzPe8WUCgYIARAAGAQSNwF-L9IrfmzZWCamCa6aNT3QAW-gvfCUrPohxEpobCnwBf9qBtqOQI_jozQeiZCbKLHKlLKLDpo' 
    },
    'YT - Góc Mẹ Và Bé': { 
        type: 'YOUTUBE', 
        clientId: '5800787278-580l9hv899l89gh2o9obu2va549oaiq3.apps.googleusercontent.com', 
        clientSecret: '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', 
        refreshToken: '1//043W2VZ27J36zCgYIARAAGAQSNwF-L9IrrtYljiB_YhuFFpmqHPM5gjhrIEBovVFSmOkEiZWs3Ex-IWPdpadFT8SCKXTvzvJCn_A' 
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
    const response = await axios({ url: directUrl, method: 'GET', responseType: 'stream', timeout: 30000 });
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
