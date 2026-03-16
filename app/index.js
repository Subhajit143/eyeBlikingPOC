import { Directory, File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  configureWebRTC,
  mediaDevices,
  RTCView,
  useBlinkDetection,
  useFaceDetection,
} from "react-native-webrtc-face-detection";

const { width, height } = Dimensions.get("window");

configureWebRTC({
  enableFaceDetection: true,
});

export default function HomeScreen() {
  const [stream, setStream] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState("user");
  const [detectionEnabled, setDetectionEnabled] = useState(false);
  const [capturedImages, setCapturedImages] = useState([]);
  const [faceDetected, setFaceDetected] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [lastPreviewImage, setLastPreviewImage] = useState(null);

  // OFFSET METHOD
  const [blinkOffset, setBlinkOffset] = useState(0);
  const [displayCount, setDisplayCount] = useState(0);

  const videoTrack = stream?.getVideoTracks()[0] ?? null;
  const lastBlinkTime = useRef(0);
  const videoRef = useRef(null);
  const capturePendingRef = useRef(false);
  const lastCapturedAtRef = useRef(0);
  const preCaptureImageRef = useRef(null);
  const preCaptureTimerRef = useRef(null);

  // Request media permissions
  useEffect(() => {
    (async () => {
      await MediaLibrary.requestPermissionsAsync();
    })();
  }, []);

  // Face detection hook
  const {
    detectionResult,
    isDetecting,
    error: faceError,
    enable: enableFaceDetection,
    disable: disableFaceDetection,
  } = useFaceDetection(videoTrack, {
    enabled: detectionEnabled,
    frameSkipCount: 2,
  });

  // Blink detection hook
  const {
    blinkCount,
    recentBlinks,
    enable: enableBlinkDetection,
    disable: disableBlinkDetection,
  } = useBlinkDetection(videoTrack, {
    enabled: detectionEnabled,
    blinkThreshold: 0.3,
    captureOnBlink: true,
    cropToFace: true,
    imageQuality: 0.9,
    maxImageWidth: 740,
    onBlink: (event) => {
      const now = Date.now();
      if (now - lastBlinkTime.current < 300) return;
      lastBlinkTime.current = now;
      console.log("👁️ Blink detected!");

      if (event.faceImage) {
        preCaptureImageRef.current = event.faceImage;
        console.log("💾 Image saved for later capture");
      }
    },
  });

  // Calculate real blink count
  useEffect(() => {
    const rawCount = Math.max(0, blinkCount - blinkOffset);
    const realBlinkCount = Math.floor(rawCount / 2);
    setDisplayCount(realBlinkCount);
  }, [blinkCount, blinkOffset]);

  useEffect(() => {
    const rawCount = Math.max(0, blinkCount - blinkOffset);
    const realBlinkCount = Math.floor(rawCount / 2);

    if (realBlinkCount >= 4 && !capturePendingRef.current) {
      console.log("🎯 4 blinks reached! Will capture...");
      capturePendingRef.current = true;

      // Clear previous timer
      if (preCaptureTimerRef.current) {
        clearTimeout(preCaptureTimerRef.current);
      }

      // 🔥 Timer set to 1.5 seconds
      preCaptureTimerRef.current = setTimeout(() => {
        // Find Recent blinks
        if (recentBlinks.length > 0) {
          for (let i = recentBlinks.length - 1; i >= 0; i--) {
            const blink = recentBlinks[i];
            if (
              blink.faceImage &&
              blink.timestamp > lastCapturedAtRef.current
            ) {
              console.log("📸 Capturing from recentBlinks!");
              saveBase64Image(blink.faceImage);
              lastCapturedAtRef.current = blink.timestamp;
              resetCapture();
              break;
            }
          }
        } else {
          console.log("⚠️ No image available");
          capturePendingRef.current = false;
        }
      }, 3500); // Changed from 300 to 1500ms (1.5 seconds)
    }
  }, [blinkCount, blinkOffset]);

  useEffect(() => {
    if (capturePendingRef.current && recentBlinks.length > 0) {
      for (let i = recentBlinks.length - 1; i >= 0; i--) {
        const blink = recentBlinks[i];
        if (blink.faceImage && blink.timestamp > lastCapturedAtRef.current) {
          console.log("📸 Capturing from recentBlinks (immediate)!");
          saveBase64Image(blink.faceImage);
          lastCapturedAtRef.current = blink.timestamp;
          resetCapture();
          break;
        }
      }
    }
  }, [recentBlinks]);

  const resetCapture = () => {
    capturePendingRef.current = false;
    preCaptureImageRef.current = null;
    if (preCaptureTimerRef.current) {
      clearTimeout(preCaptureTimerRef.current);
    }
    setBlinkOffset(blinkCount);
  };

  // Auto-enable detection
  useEffect(() => {
    if (videoTrack && isCameraActive) {
      setDetectionEnabled(true);
      setTimeout(() => {
        enableFaceDetection();
        enableBlinkDetection();
      }, 500);
    } else {
      setDetectionEnabled(false);
      disableFaceDetection();
      disableBlinkDetection();
    }
  }, [videoTrack, isCameraActive]);

  // Monitor face detection
  useEffect(() => {
    if (detectionResult) {
      const hasFaces =
        detectionResult.faces && detectionResult.faces.length > 0;
      if (faceDetected && !hasFaces) {
        resetBlinkState();
      }
      setFaceDetected(hasFaces);
    }
  }, [detectionResult]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (preCaptureTimerRef.current) {
        clearTimeout(preCaptureTimerRef.current);
      }
    };
  }, []);

  const saveBase64Image = async (base64String) => {
    try {
      console.log("💾 Saving image, length:", base64String.length);

      const faceDir = new Directory(Paths.document, "captured_faces");
      await faceDir.create({ idempotent: true });

      const filename = `face_${Date.now()}.png`;
      const file = new File(faceDir, filename);
      await file.create();

      const bytes = Uint8Array.from(atob(base64String), (c) => c.charCodeAt(0));
      await file.write(bytes);

      const fileInfo = await file.info();

      const newImage = {
        id: Date.now(),
        uri: file.uri,
        base64: base64String,
        timestamp: new Date().toLocaleTimeString(),
        size: fileInfo.size,
      };

      setCapturedImages((prev) => [newImage, ...prev].slice(0, 20));
      setLastPreviewImage(newImage);

      console.log("✅ Image saved!");
    } catch (error) {
      console.log("❌ Save error:", error);
    }
  };

  const resetBlinkState = () => {
    setBlinkOffset(blinkCount);
    capturePendingRef.current = false;
    if (preCaptureTimerRef.current) {
      clearTimeout(preCaptureTimerRef.current);
    }
    preCaptureImageRef.current = null;
  };

  const startWebRTCCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: facingMode,
          frameRate: 30,
          width: 640,
          height: 480,
        },
        audio: false,
      };

      const mediaStream = await mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setIsCameraActive(true);

      setBlinkOffset(0);
      setDisplayCount(0);
      setFaceDetected(false);
      capturePendingRef.current = false;
      lastCapturedAtRef.current = 0;
      lastBlinkTime.current = 0;
      preCaptureImageRef.current = null;
      if (preCaptureTimerRef.current) {
        clearTimeout(preCaptureTimerRef.current);
      }
    } catch (error) {
      Alert.alert("Camera Error", error.message);
    }
  };

  const stopWebRTCCamera = () => {
    setDetectionEnabled(false);
    disableFaceDetection();
    disableBlinkDetection();

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream.release();
      setStream(null);
    }
    setIsCameraActive(false);
  };

  const switchCamera = () => {
    stopWebRTCCamera();
    const newMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);
    setTimeout(startWebRTCCamera, 500);
  };

  const resetBlinks = () => {
    resetBlinkState();
  };

  const viewImage = (image) => {
    setSelectedImage(image);
    setModalVisible(true);
  };

  const deleteImage = async (imageId) => {
    const image = capturedImages.find((img) => img.id === imageId);
    if (image?.uri) {
      try {
        await new File(image.uri).delete();
      } catch (err) {
        console.log("Error deleting file:", err);
      }
    }

    setCapturedImages((prev) => prev.filter((img) => img.id !== imageId));
    if (lastPreviewImage?.id === imageId) {
      setLastPreviewImage(capturedImages.length > 1 ? capturedImages[1] : null);
    }
    setModalVisible(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      <View style={styles.cameraContainer}>
        {isCameraActive && stream ? (
          <RTCView
            ref={videoRef}
            streamURL={stream.toURL()}
            style={styles.rtcView}
            objectFit="cover"
            mirror={facingMode === "user"}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Camera Off</Text>
          </View>
        )}

        <View style={styles.topOverlay}>
          <View style={styles.statsRow}>
            <View style={styles.statBadge}>
              <Text style={styles.statBadgeText}>
                👤 {detectionResult?.faces?.length || 0}
              </Text>
            </View>
            <View style={styles.statBadge}>
              <Text style={styles.statBadgeText}>👁️ {displayCount}/4</Text>
            </View>
          </View>

          <View style={styles.cameraControls}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={switchCamera}
              disabled={!isCameraActive}
            >
              <Text style={styles.iconButtonText}>🔄</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={resetBlinks}
              disabled={!isCameraActive}
            >
              <Text style={styles.iconButtonText}>↺</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Ready to capture indicator */}
        {displayCount >= 4 && !capturePendingRef.current && (
          <View style={styles.readyOverlay}>
            <Text style={styles.readyText}>📸 READY TO CAPTURE</Text>
          </View>
        )}

        <View style={styles.bottomControls}>
          <TouchableOpacity
            style={styles.powerButton}
            onPress={isCameraActive ? stopWebRTCCamera : startWebRTCCamera}
          >
            <Text style={styles.powerButtonText}>
              {isCameraActive ? "⏹" : "▶"}
            </Text>
          </TouchableOpacity>
        </View>

        {lastPreviewImage && (
          <TouchableOpacity
            style={styles.previewBox}
            onPress={() => viewImage(lastPreviewImage)}
          >
            <Image
              source={{
                uri: `data:image/png;base64,${lastPreviewImage.base64}`,
              }}
              style={styles.previewImage}
            />
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={modalVisible}
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {selectedImage && (
              <>
                <Image
                  source={{
                    uri: `data:image/png;base64,${selectedImage.base64}`,
                  }}
                  style={styles.modalImage}
                />
                <Text style={styles.modalTime}>{selectedImage.timestamp}</Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.closeModalButton}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={styles.modalButtonText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => deleteImage(selectedImage.id)}
                  >
                    <Text style={styles.modalButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  cameraContainer: { flex: 1, backgroundColor: "#000", position: "relative" },
  rtcView: { flex: 1, width: width, height: height },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
  },
  placeholderText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  topOverlay: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statsRow: { flexDirection: "row", gap: 10 },
  statBadge: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  statBadgeText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  cameraControls: { flexDirection: "row", gap: 10 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fff",
  },
  iconButtonText: { color: "#fff", fontSize: 20 },
  readyOverlay: {
    position: "absolute",
    top: 120,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  readyText: {
    backgroundColor: "#4CAF50",
    color: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    fontWeight: "bold",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#fff",
  },
  bottomControls: {
    position: "absolute",
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  powerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  powerButtonText: { color: "#fff", fontSize: 24 },
  previewBox: {
    position: "absolute",
    bottom: 30,
    left: 20,
    width: 70,
    height: 70,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#4CAF50",
    backgroundColor: "#1a1a1a",
    overflow: "hidden",
  },
  previewImage: { width: "100%", height: "100%" },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  modalContent: {
    backgroundColor: "#1a1a1a",
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    width: "90%",
  },
  modalImage: {
    width: 300,
    height: 300,
    borderRadius: 16,
    marginBottom: 15,
    borderWidth: 3,
    borderColor: "#4CAF50",
  },
  modalTime: { color: "#888", fontSize: 14, marginBottom: 20 },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
  },
  closeModalButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginRight: 10,
  },
  deleteButton: {
    backgroundColor: "#FF4444",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginLeft: 10,
  },
  modalButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
