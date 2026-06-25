import React, { useEffect, useState, useRef } from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Track } from '../types';
import { downloadManager, DownloadTask } from '../services/downloadManager';
import { useStore } from '../store/useStore';

interface DownloadButtonProps {
  track: Track;
  size?: 'small' | 'medium';
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({ track, size = 'medium' }) => {
  const [task, setTask] = useState<DownloadTask | undefined>();
  const [progress, setProgress] = useState(0);
  const showAlert = useStore((s) => s.showAlert);
  const clearAlertQueueRef = useRef<() => void>();

  useEffect(() => {
    clearAlertQueueRef.current = useStore.getState()._clearAlertQueue;
  }, []);

  useEffect(() => {
    const checkDownload = async () => {
      try {
        const path = await downloadManager.getDownloadedFilePath(track.id);
        if (path) {
          setTask({
            id: `${track.id}`,
            track,
            status: 'completed',
            progress: 100,
            bytesDownloaded: 0,
            totalBytes: 0,
            retryAttempts: 0,
          });
        }
      } catch (error) {
        console.warn('[DownloadButton] Failed to check download:', error);
      }
    };

    checkDownload();

    // Register listeners (these don't return unsubscribe functions in downloadManager)
    downloadManager.onProgress((p) => {
      if (p.taskId.includes(track.id)) {
        setProgress(p.progress);
      }
    });

    downloadManager.onComplete((taskId, success) => {
      if (taskId.includes(track.id)) {
        if (success) {
          setTask({
            id: taskId,
            track,
            status: 'completed',
            progress: 100,
            bytesDownloaded: 0,
            totalBytes: 0,
            retryAttempts: 0,
          });
          setProgress(100);
          showAlert('Download Complete', `"${track.title}" saved offline.`);
        } else {
          setTask(undefined);
          setProgress(0);
          showAlert('Download Failed', `Failed to download "${track.title}".`);
        }
      }
    });
  }, [track.id, showAlert]);

  useEffect(() => {
    return () => {
      clearAlertQueueRef.current?.();
    };
  }, []);

  const handleDownload = async () => {
    if (task?.status === 'completed') return; // Already downloaded
    if (task?.status === 'downloading') {
      await downloadManager.pauseDownload();
      setTask(undefined);
      return;
    }

    // Start download
    const taskId = await downloadManager.queueDownload(track);
    setTask({ id: taskId, track, status: 'queued', progress: 0, bytesDownloaded: 0, totalBytes: 0, retryAttempts: 0 });
  };

  const styles = StyleSheet.create({
    container: {
      paddingHorizontal: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    button: {
      padding: size === 'small' ? 6 : 8,
      borderRadius: 6,
      backgroundColor: '#333',
    },
    text: {
      fontSize: size === 'small' ? 12 : 14,
      color: '#fff',
      fontWeight: '600',
    },
    completed: {
      backgroundColor: '#4CAF50',
    },
  });

  if (!task || task.status === 'queued') {
    return (
      <TouchableOpacity style={[styles.button]} onPress={handleDownload}>
        <Text style={styles.text}>⬇ Download</Text>
      </TouchableOpacity>
    );
  }

  if (task.status === 'downloading') {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.button} onPress={handleDownload}>
          <Text style={styles.text}>{progress}%</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (task.status === 'completed') {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={[styles.button, styles.completed]} disabled>
          <Text style={styles.text}>✓ Cached</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (task.status === 'failed') {
    return (
      <TouchableOpacity style={styles.button} onPress={handleDownload}>
        <Text style={styles.text}>⚠ Retry</Text>
      </TouchableOpacity>
    );
  }

  return null;
};
