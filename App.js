import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  StatusBar,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {
  mediaDevices,
  RTCView,
  configureWebRTC,
  useFaceDetection,
  useBlinkDetection,
  FaceDetectionOverlay,
} from 'react-native-webrtc-face-detection';

// WebRTC ফেস ডিটেকশন কনফিগার করুন (একবার কল করতে হবে)
configureWebRTC({
  enableFaceDetection: true,
});

export default function App() {
  const [stream, setStream] = useState(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState('user'); // 'user' for front, 'environment' for back
  const [capturedImages, setCapturedImages] = useState([]);
  const [stats, setStats] = useState({
    totalBlinks: 0,
    leftEyeBlinks: 0,
    rightEyeBlinks: 0,
    lastBlinkTime: null,
  });

  const videoTrack = stream?.getVideoTracks()[0] ?? null;
  const blinkSoundRef = useRef(null);

  // ফেস ডিটেকশন হুক
  const { detectionResult, isDetecting, error: faceError } = useFaceDetection(
    videoTrack,
    {
      enabled: isCameraActive,
      frameSkipCount: 2, // প্রতি ২ ফ্রেমে একবার প্রসেস করবে
    }
  );

  // ব্লিংক ডিটেকশন হুক
  const {
    blinkCount,
    recentBlinks,
    leftEyeBlinkCount,
    rightEyeBlinkCount,
    enable: enableBlinkDetection,
    disable: disableBlinkDetection,
  } = useBlinkDetection(videoTrack, {
    enabled: isCameraActive,
    blinkThreshold: 0.3, // চোখ বন্ধের থ্রেশহোল্ড
    captureOnBlink: true, // ব্লিংক হলে ছবি ক্যাপচার করবে
    cropToFace: true, // শুধু মুখের অংশ ক্রপ করবে
    imageQuality: 0.8, // ছবির কোয়ালিটি
    maxImageWidth: 480, // সর্বোচ্চ ছবির প্রস্থ
    onBlink: (event) => {
      // ব্লিংক ইভেন্ট হ্যান্ডলার
      console.log('Blink detected!', event);
      
      // স্ট্যাট আপডেট
      setStats(prev => ({
        ...prev,
        totalBlinks: prev.totalBlinks + 1,
        leftEyeBlinks: event.eye === 'left' ? prev.leftEyeBlinks + 1 : prev.leftEyeBlinks,
        rightEyeBlinks: event.eye === 'right' ? prev.rightEyeBlinks + 1 : prev.rightEyeBlinks,
        lastBlinkTime: new Date().toLocaleTimeString(),
      }));

      // যদি ছবি থাকে তাহলে সেটা সেভ করুন
      if (event.faceImage) {
        setCapturedImages(prev => [
          {
            id: Date.now(),
            image: event.faceImage,
            timestamp: new Date().toLocaleTimeString(),
            eye: event.eye,
          },
          ...prev.slice(0, 9), // সর্বোচ্চ ১০টি ছবি রাখবে
        ]);
      }
    },
  });

  // ক্যামেরা পারমিশন চেক এবং স্টার্ট
  useEffect(() => {
    checkPermissions();
    return () => {
      // ক্লিনআপ
      if (stream) {
        stream.release();
      }
      disableBlinkDetection();
    };
  }, []);

  // ভিডিও ট্র্যাক পরিবর্তন হলে ব্লিংক ডিটেকশন এনাবল/ডিসেবল
  useEffect(() => {
    if (videoTrack && isCameraActive) {
      enableBlinkDetection();
    } else {
      disableBlinkDetection();
    }
  }, [videoTrack, isCameraActive]);

  // ক্যামেরা পারমিশন চেক
  const checkPermissions = async () => {
    try {
      // MediaDevices এনামেরেট করুন
      const devices = await mediaDevices.enumerateDevices();
      const hasCamera = devices.some(device => device.kind === 'videoinput');
      
      if (hasCamera) {
        setHasPermission(true);
      } else {
        Alert.alert('Error', 'No camera found on device');
      }
    } catch (error) {
      console.error('Permission error:', error);
      Alert.alert('Error', 'Failed to get camera permissions');
    }
  };

  // ক্যামেরা স্টার্ট
  const startCamera = async () => {
    try {
      const mediaStream = await mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          frameRate: 30,
          width: 640,
          height: 480,
        },
        audio: false,
      });
      
      setStream(mediaStream);
      setIsCameraActive(true);
    } catch (error) {
      console.error('Camera start error:', error);
      Alert.alert('Error', 'Failed to start camera: ' + error.message);
    }
  };

  // ক্যামেরা স্টপ
  const stopCamera = () => {
    if (stream) {
      stream.release();
      setStream(null);
    }
    setIsCameraActive(false);
    disableBlinkDetection();
  };

  // ক্যামেরা সুইচ (ফ্রন্ট/ব্যাক)
  const switchCamera = () => {
    stopCamera();
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    setTimeout(() => {
      startCamera();
    }, 100);
  };

  // ছবি ক্লিয়ার
  const clearImages = () => {
    setCapturedImages([]);
  };

  // স্ট্যাট রিসেট
  const resetStats = () => {
    setStats({
      totalBlinks: 0,
      leftEyeBlinks: 0,
      rightEyeBlinks: 0,
      lastBlinkTime: null,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      {/* হেডার */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Eye Blink Detection</Text>
        <Text style={styles.headerSubtitle}>চোখের পলক ডিটেক্টর</Text>
      </View>

      {/* ক্যামেরা ভিউ */}
      <View style={styles.cameraContainer}>
        {isCameraActive && stream ? (
          <View style={styles.videoWrapper}>
            <RTCView
              streamURL={stream.toURL()}
              style={styles.rtcView}
              objectFit="cover"
              mirror={facingMode === 'user'} // ফ্রন্ট ক্যামেরার জন্য মিরর
            />
            
            {/* ফেস ডিটেকশন ওভারলে */}
            {detectionResult && (
              <FaceDetectionOverlay
                detectionResult={detectionResult}
                mirror={facingMode === 'user'}
                objectFit="cover"
                config={{
                  showFaceBox: true,
                  showEyeBoxes: true,
                  showMouthBox: false,
                  showHeadPose: true,
                  showEyeStatus: true,
                  faceBoxColor: '#00FF00',
                  eyeBoxColor: '#00AAFF',
                  eyeClosedColor: '#FF4444',
                  strokeWidth: 2,
                  eyeBoxSize: 30,
                  eyeBoxBorderRadius: 15, // সার্কেল করার জন্য
                  labelFontSize: 12,
                  labelBackgroundColor: 'rgba(0, 0, 0, 0.7)',
                }}
                style={styles.overlay}
              />
            )}

            {/* ডিটেকশন স্ট্যাটাস */}
            <View style={styles.detectionStatus}>
              <Text style={styles.statusText}>
                Faces: {detectionResult?.faces.length ?? 0}
              </Text>
              {detectionResult?.faces.map((face, index) => (
                <View key={index} style={styles.faceStatus}>
                  <Text style={styles.eyeStatusText}>
                    👁️ Left: {(face.leftEyeOpenProbability * 100).toFixed(0)}%
                  </Text>
                  <Text style={styles.eyeStatusText}>
                    👁️ Right: {(face.rightEyeOpenProbability * 100).toFixed(0)}%
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderText}>
              ক্যামেরা বন্ধ আছে
            </Text>
            <Text style={styles.placeholderSubtext}>
              স্টার্ট বাটনে ক্লিক করুন
            </Text>
          </View>
        )}
      </View>

      {/* কন্ট্রোল বাটন */}
      <View style={styles.controls}>
        {!isCameraActive ? (
          <TouchableOpacity style={styles.startButton} onPress={startCamera}>
            <Text style={styles.buttonText}>📷 ক্যামেরা স্টার্ট</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.stopButton} onPress={stopCamera}>
              <Text style={styles.buttonText}>⏹️ বন্ধ করুন</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.switchButton} onPress={switchCamera}>
              <Text style={styles.buttonText}>🔄 সুইচ ক্যামেরা</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* স্ট্যাটিস্টিক্স */}
      {isCameraActive && (
        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>📊 পলক পরিসংখ্যান</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalBlinks}</Text>
              <Text style={styles.statLabel}>মোট পলক</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.leftEyeBlinks}</Text>
              <Text style={styles.statLabel}>বাম চোখ</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.rightEyeBlinks}</Text>
              <Text style={styles.statLabel}>ডান চোখ</Text>
            </View>
          </View>
          {stats.lastBlinkTime && (
            <Text style={styles.lastBlink}>
              শেষ পলক: {stats.lastBlinkTime}
            </Text>
          )}
          <TouchableOpacity style={styles.resetButton} onPress={resetStats}>
            <Text style={styles.resetButtonText}>রিসেট</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ক্যাপচার করা ছবি */}
      {capturedImages.length > 0 && (
        <View style={styles.galleryContainer}>
          <View style={styles.galleryHeader}>
            <Text style={styles.galleryTitle}>📸 ক্যাপচার করা ছবি</Text>
            <TouchableOpacity onPress={clearImages}>
              <Text style={styles.clearButton}>সব মুছুন</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {capturedImages.map((item) => (
              <View key={item.id} style={styles.galleryItem}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${item.image}` }}
                  style={styles.galleryImage}
                />
                <View style={styles.galleryItemOverlay}>
                  <Text style={styles.galleryItemText}>
                    {item.timestamp}
                  </Text>
                  <Text style={styles.galleryItemText}>
                    {item.eye === 'left' ? '👁️ বাম' : '👁️ ডান'}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* এরর মেসেজ */}
      {faceError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{faceError}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  rtcView: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  detectionStatus: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 8,
  },
  statusText: {
    color: '#0f0',
    fontSize: 14,
    fontWeight: 'bold',
  },
  faceStatus: {
    marginTop: 5,
  },
  eyeStatusText: {
    color: '#fff',
    fontSize: 12,
  },
  placeholderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholderSubtext: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#1a1a1a',
  },
  startButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  stopButton: {
    backgroundColor: '#f44336',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    marginRight: 10,
  },
  switchButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statsContainer: {
    padding: 20,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  statsTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: '#4CAF50',
    fontSize: 28,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  lastBlink: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  resetButton: {
    position: 'absolute',
    right: 20,
    top: 20,
    backgroundColor: '#333',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 12,
  },
  galleryContainer: {
    padding: 15,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  galleryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  galleryTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  clearButton: {
    color: '#f44336',
    fontSize: 14,
  },
  galleryItem: {
    marginRight: 12,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  galleryImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  galleryItemOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 5,
  },
  galleryItemText: {
    color: '#fff',
    fontSize: 10,
  },
  errorContainer: {
    padding: 10,
    backgroundColor: '#f44336',
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
});