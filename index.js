const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

// ================= 1. CẤU HÌNH CƠ BẢN =================
const SPREADSHEET_ID = 'ĐIỀN_ID_BẢNG_TÍNH_VÀO_ĐÂY';
const SHEET_NAME = 'Trang tính1'; 

// ================= 2. TỪ ĐIỂN TÀI KHOẢN ĐA NỀN TẢNG =================
const ACCOUNTS = {
    // 1. Nhóm Facebook (Cần Page ID và Page Token)
    'FB - Cafe Số': { type: 'FACEBOOK', id: 'ID_PAGE', token: 'TOKEN_PAGE' },
    
    // 2. Nhóm Instagram (Dùng chung Token với FB, cần IG User ID)
    'IG - Cafe Số': { type: 'INSTAGRAM', ig_id: 'ID_INSTAGRAM', token: 'TOKEN_PAGE_LIÊN_KẾT' },
    
    // 3. Nhóm YouTube (Cần Client ID, Secret và Refresh Token từ Google Cloud)
    'YT - Kênh Chính': { type: 'YOUTUBE', clientId: '...', clientSecret: '...', refreshToken: '...' },
    
    // 4. Nhóm TikTok (Cần Access Token từ TikTok For Developers)
    'TT - Shop Giày': { type: 'TIKTOK', openId: '...', accessToken: '...' }
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
    console.log('🔄 Đang kiểm tra lịch đăng đa nền tảng...');
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:H100`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) return console.log('Không có dữ liệu.');

        const now = new Date(); 

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
                        console.log(`-> Đang xử lý bài cho ${nenTang}...`);
                        
                        // Lấy link Drive đầu tiên để tải file
                        const arrLinks = linkDrive ? linkDrive.split(',').map(l => l.trim()).filter(l => l) : [];
                        const tempFilePath = arrLinks.length > 0 ? path.join(__dirname, `temp_${Date.now()}.mp4`) : null;
                        if (tempFilePath) await downloadFileDrive(arrLinks[0], tempFilePath);

                        // RẼ NHÁNH XỬ LÝ THEO TỪNG NỀN TẢNG
                        if (accountConfig.type === 'FACEBOOK') {
                            // (Mã xử lý Facebook của bạn giữ nguyên ở đây)
                            console.log('Đang gọi API Facebook...');
                            // await dangBaiTextFacebook...
                        } 
                        else if (accountConfig.type === 'INSTAGRAM') {
                            console.log('Đang gọi API Instagram...');
                            // Hàm xử lý IG Graph API sẽ nằm đây
                        }
                        else if (accountConfig.type === 'YOUTUBE') {
                            console.log('Đang gọi API YouTube...');
                            // Hàm upload bằng google.youtube('v3') sẽ nằm đây
                        }
                        else if (accountConfig.type === 'TIKTOK') {
                            console.log('Đang gọi API TikTok...');
                            // Hàm gọi TikTok Direct Post API sẽ nằm đây
                        }

                        if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

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

async function downloadFileDrive(driveLink, destPath) {
    const fileIdMatch = driveLink.match(/[-\w]{25,}/);
    if (!fileIdMatch) return;
    const directUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[0]}`;
    const writer = fs.createWriteStream(destPath);
    const response = await axios({ url: directUrl, method: 'GET', responseType: 'stream' });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

kiemTraVaDangBai();
