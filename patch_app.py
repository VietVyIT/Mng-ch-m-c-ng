import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    start_str = "function FaceModal({ checkedIn, faceRegistered, onClose, onSuccess }) {"
    end_str = "  }, []);"

    start_idx = content.find(start_str)
    if start_idx == -1:
        print("Start not found")
        return

    end_idx = content.find(end_str, start_idx)
    if end_idx == -1:
        print("End not found")
        return
        
    end_idx += len(end_str)

    replacement = '''let isModelsLoaded = false;
let isModelsLoading = false;

function FaceModal({ checkedIn, faceRegistered, onClose, onSuccess }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraState, setCameraState] = useState('starting');
  const [cameraError, setCameraError] = useState('');
  const [modelReady, setModelReady] = useState(isModelsLoaded);
  const [modelError, setModelError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function startVideo() {
      if (!isSecureCameraContext()) {
        setCameraError('Camera chỉ hoạt động trên HTTPS trong môi trường production. Vui lòng mở ứng dụng bằng đường dẫn HTTPS.');
        setCameraState('error');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('error');
        setCameraError('Trình duyệt không hỗ trợ camera. Hãy dùng Chrome, Edge hoặc Safari trên HTTPS/localhost.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.error("Lỗi Play Camera:", e));
            if (!cancelled) setCameraState('ready');
          };
        }
      } catch (error) {
        if (cancelled) return;
        setCameraState('error');
        setCameraError(error.name === 'NotAllowedError'
          ? 'Bạn đã từ chối quyền camera. Hãy cho phép camera trong thanh địa chỉ rồi thử lại.'
          : error.message || 'Không thể mở camera. Hãy kiểm tra quyền truy cập.');
      }
    }

    async function loadModelsOnce() {
      if (isModelsLoaded) {
        setModelReady(true);
        return;
      }
      if (isModelsLoading) return;
      isModelsLoading = true;

      const LOCAL_URL = apiUrl.replace('/api', '') + '/models';
      const CDN_FALLBACK_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
      
      try {
        await Promise.race([
          Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(LOCAL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(LOCAL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(LOCAL_URL),
          ]),
          timeoutPromise
        ]);
        isModelsLoaded = true;
        if (!cancelled) setModelReady(true);
      } catch (localErr) {
        console.warn("Model local bị lỗi hoặc timeout, đang tải từ CDN...", localErr);
        try {
          await Promise.race([
            Promise.all([
              faceapi.nets.tinyFaceDetector.loadFromUri(CDN_FALLBACK_URL),
              faceapi.nets.faceLandmark68Net.loadFromUri(CDN_FALLBACK_URL),
              faceapi.nets.faceRecognitionNet.loadFromUri(CDN_FALLBACK_URL),
            ]),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
          ]);
          isModelsLoaded = true;
          if (!cancelled) setModelReady(true);
        } catch (cdnErr) {
          console.error("Không thể nạp model AI, fallback sang chế độ cơ bản:", cdnErr);
          if (!cancelled) setModelError("Không thể nạp model AI. Vui lòng kiểm tra mạng!");
        }
      } finally {
        isModelsLoading = false;
      }
    }

    startVideo();
    loadModelsOnce();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);'''

    new_content = content[:start_idx] + replacement + content[end_idx:]
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Success")

process_file('d:/Phát đồng phục/management/client/src/App.jsx')
