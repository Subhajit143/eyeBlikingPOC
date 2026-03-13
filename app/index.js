import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
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
  View
} from "react-native";
import { captureRef } from "react-native-view-shot";
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
  const [showCaptureButton, setShowCaptureButton] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureTimeout, setCaptureTimeout] = useState(null);
  const [lastPreviewImage, setLastPreviewImage] = useState(null);

  // OFFSET METHOD
  const [blinkOffset, setBlinkOffset] = useState(0);
  // ✅ Real blink count (প্রতি ২ ব্লিংক ইভেন্ট = ১ টি ব্লিঙ্ক)
  const [displayCount, setDisplayCount] = useState(0);

  const videoTrack = stream?.getVideoTracks()[0] ?? null;
  const lastBlinkTime = useRef(0);
  const rtcViewRef = useRef(null);

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
    blinkCount, // library থেকে পাওয়া raw blink count (প্রতি চোখের জন্য আলাদা)
    enable: enableBlinkDetection,
    disable: disableBlinkDetection,
  } = useBlinkDetection(videoTrack, {
    enabled: detectionEnabled,
    blinkThreshold: 0.3,
    captureOnBlink: false,
    onBlink: (event) => {
      const now = Date.now();
      if (now - lastBlinkTime.current < 300) return; // 300ms ডিবাউন্স
      lastBlinkTime.current = now;

      console.log("👁️ Single eye blink detected!");

      if (isCapturing) {
        captureImage();
      }
    },
  });

  // ✅ সিম্পল ব্লিংক কাউন্ট ক্যালকুলেশন - ২ ব্লিংক ইভেন্ট = ১ টি ব্লিঙ্ক
  useEffect(() => {
    // raw blinkCount কে ২ দিয়ে ভাগ করে পূর্ণসংখ্যা বের করা
    const rawCount = Math.max(0, blinkCount - blinkOffset);
    const realBlinkCount = Math.floor(rawCount / 2); // প্রতি ২ ইভেন্ট = ১ ব্লিঙ্ক

    setDisplayCount(realBlinkCount);

    // ২ টি সম্পূর্ণ ব্লিঙ্ক = ৪ টি ইভেন্ট
    if (realBlinkCount >= 2) {
      setShowCaptureButton(true);
    } else {
      setShowCaptureButton(false);
    }
  }, [blinkCount, blinkOffset]);

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

  const resetBlinkState = () => {
    setBlinkOffset(blinkCount); // অফসেট raw blinkCount এ সেট করছি
    setShowCaptureButton(false);
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
      setShowCaptureButton(false);
      setIsCapturing(false);
      lastBlinkTime.current = 0;
    } catch (error) {
      Alert.alert("Camera Error", error.message);
    }
  };

  const stopWebRTCCamera = () => {
    setDetectionEnabled(false);
    setIsCapturing(false);
    if (captureTimeout) {
      clearTimeout(captureTimeout);
      setCaptureTimeout(null);
    }
    disableFaceDetection();
    disableBlinkDetection();

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream.release();
      setStream(null);
    }
    setIsCameraActive(false);
  };

  const captureImage = async () => {
    if (!rtcViewRef.current || !isCapturing) return;

    try {
      console.log("📸 Capturing image...");

      const base64Image = await captureRef(rtcViewRef, {
        format: "jpg",
        quality: 0.9,
        result: "base64",
      });

      await processAndSaveImage(base64Image);
    } catch (error) {
      console.log("❌ Capture error:", error);
      Alert.alert("Error", "Failed to capture image");
      setIsCapturing(false);
    }
  };

  const processAndSaveImage = async (base64Image) => {
    try {
      let base64String = base64Image;
      if (base64Image.includes("base64,")) {
        base64String = base64Image.split("base64,")[1];
      }

      const tempUri = FileSystem.cacheDirectory + `temp_${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(tempUri, base64String, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const manipResult = await ImageManipulator.manipulateAsync(
        tempUri,
        [{ resize: { width: 640 } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
      );

      const filename = `face_${Date.now()}.jpg`;
      const fileUri = FileSystem.documentDirectory + filename;

      await FileSystem.copyAsync({
        from: manipResult.uri,
        to: fileUri,
      });

      await FileSystem.deleteAsync(tempUri);
      if (manipResult.uri !== tempUri) {
        await FileSystem.deleteAsync(manipResult.uri);
      }

      const newImage = {
        id: Date.now(),
        uri: fileUri,
        timestamp: new Date().toLocaleTimeString(),
      };

      setCapturedImages((prev) => [newImage, ...prev].slice(0, 20));
      setLastPreviewImage(newImage);

      setIsCapturing(false);
      if (captureTimeout) {
        clearTimeout(captureTimeout);
        setCaptureTimeout(null);
      }

      resetBlinkState();
    } catch (error) {
      console.log("❌ Save error:", error);
      setIsCapturing(false);
    }
  };

  const startCaptureMode = () => {
    if (!stream || isCapturing) return;

    console.log("📸 Starting capture mode...");
    setIsCapturing(true);

    const timeout = setTimeout(() => {
      if (isCapturing) {
        console.log("⏰ Capture timeout");
        setIsCapturing(false);
        Alert.alert("Timeout", "No blink detected. Please try again.");
      }
    }, 5000);

    setCaptureTimeout(timeout);
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

  const deleteImage = (imageId) => {
    const image = capturedImages.find((img) => img.id === imageId);
    if (image?.uri) {
      FileSystem.deleteAsync(image.uri).catch((err) =>
        console.log("Error deleting file:", err),
      );
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

      {/* Main Camera - Full Screen */}
      <View style={styles.cameraContainer}>
        {isCameraActive && stream ? (
          <RTCView
            ref={rtcViewRef}
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

        {/* Top Status Overlay */}
        <View style={styles.topOverlay}>
          <View style={styles.statsRow}>
            <View style={styles.statBadge}>
              <Text style={styles.statBadgeText}>
                👤 {detectionResult?.faces?.length || 0}
              </Text>
            </View>
            <View style={styles.statBadge}>
              {/* ✅ এখন real blink count দেখাচ্ছে */}
              <Text style={styles.statBadgeText}>👁️ {displayCount}</Text>
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

        {/* Capture Button - Shows when 2 REAL blinks detected */}
        {showCaptureButton && isCameraActive && !isCapturing && (
          <TouchableOpacity
            style={styles.captureTriggerButton}
            onPress={startCaptureMode}
          >
            <Text style={styles.captureTriggerText}>📸</Text>
          </TouchableOpacity>
        )}

        {/* Capture Mode Indicator */}
        {isCapturing && (
          <View style={styles.captureModeOverlay}>
            <Text style={styles.captureModeText}>BLINK TO CAPTURE</Text>
            <TouchableOpacity
              style={styles.cancelCaptureButton}
              onPress={() => {
                setIsCapturing(false);
                if (captureTimeout) {
                  clearTimeout(captureTimeout);
                  setCaptureTimeout(null);
                }
              }}
            >
              <Text style={styles.cancelCaptureText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom Controls */}
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

        {/* Left Bottom Preview Box */}
        {lastPreviewImage && (
          <TouchableOpacity
            style={styles.previewBox}
            onPress={() => viewImage(lastPreviewImage)}
          >
            <Image
              source={{ uri: lastPreviewImage.uri }}
              style={styles.previewImage}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Image Preview Modal */}
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
                  source={{ uri: selectedImage.uri }}
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
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000",
    position: "relative",
  },
  rtcView: {
    flex: 1,
    width: width,
    height: height,
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
  },
  placeholderText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  // Top Overlay
  topOverlay: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statBadge: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  statBadgeText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  cameraControls: {
    flexDirection: "row",
    gap: 10,
  },
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
  iconButtonText: {
    color: "#fff",
    fontSize: 20,
  },
  // Capture Trigger Button
  captureTriggerButton: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  captureTriggerText: {
    color: "#fff",
    fontSize: 30,
  },
  // Capture Mode Overlay
  captureModeOverlay: {
    position: "absolute",
    top: 120,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  captureModeText: {
    backgroundColor: "#FF4444",
    color: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    fontWeight: "bold",
    fontSize: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#fff",
  },
  cancelCaptureButton: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,68,68,0.9)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fff",
  },
  cancelCaptureText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  // Bottom Controls
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
  powerButtonText: {
    color: "#fff",
    fontSize: 24,
  },
  // Left Bottom Preview Box
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
  previewImage: {
    width: "100%",
    height: "100%",
  },
  // Modal Styles
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
  modalTime: {
    color: "#888",
    fontSize: 14,
    marginBottom: 20,
  },
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
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
