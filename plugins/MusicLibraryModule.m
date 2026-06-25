#import <React/RCTBridgeModule.h>
#import <MediaPlayer/MediaPlayer.h>
#import <UIKit/UIKit.h>

@interface MusicLibraryModule : NSObject <RCTBridgeModule>
@end

@implementation MusicLibraryModule

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(requestPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    MPMediaLibraryAuthorizationStatus status = [MPMediaLibrary authorizationStatus];

    if (status == MPMediaLibraryAuthorizationStatusAuthorized) {
      resolve(@YES);
      return;
    }

    if (status == MPMediaLibraryAuthorizationStatusNotDetermined) {
      [MPMediaLibrary requestMediaLibraryAccessWithCompletion:^(MPMediaLibraryAuthorizationStatus status) {
        resolve(@(status == MPMediaLibraryAuthorizationStatusAuthorized));
      }];
      return;
    }

    resolve(@NO);
  });
}

RCT_EXPORT_METHOD(getTracks:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      MPMediaQuery *query = [MPMediaQuery songsQuery];
      NSMutableArray *tracks = [NSMutableArray array];

      for (MPMediaItem *item in query.items) {
        @try {
          NSString *title = [item valueForProperty:MPMediaItemPropertyTitle] ?: @"Unknown";
          NSString *artist = [item valueForProperty:MPMediaItemPropertyArtist] ?: @"Unknown Artist";
          NSString *album = [item valueForProperty:MPMediaItemPropertyAlbumTitle] ?: @"Unknown Album";
          NSNumber *duration = [item valueForProperty:MPMediaItemPropertyPlaybackDuration] ?: @0;
          NSURL *assetURL = [item valueForProperty:MPMediaItemPropertyAssetURL];
          NSString *uri = assetURL ? [assetURL absoluteString] : nil;
          NSString *trackId = [item valueForProperty:MPMediaItemPropertyPersistentID];

          if (uri && trackId) {
            NSDictionary *track = @{
              @"id": trackId ?: @"unknown",
              @"title": title,
              @"artist": artist,
              @"album": album,
              @"duration": duration,
              @"uri": uri
            };
            [tracks addObject:track];
          }
        } @catch (NSException *e) {
          // Skip problematic tracks
        }
      }

      dispatch_async(dispatch_get_main_queue(), ^{
        resolve(tracks);
      });
    } @catch (NSException *e) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"ITUNES_ERROR", [e reason], nil);
      });
    }
  });
}

RCT_EXPORT_METHOD(getArtwork:(NSString *)trackId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      MPMediaQuery *query = [MPMediaQuery songsQuery];

      for (MPMediaItem *item in query.items) {
        NSString *itemId = [item valueForProperty:MPMediaItemPropertyPersistentID];
        if ([itemId isEqualToString:trackId]) {
          MPMediaItemArtwork *artwork = [item valueForProperty:MPMediaItemPropertyArtwork];
          if (artwork) {
            UIImage *image = [artwork imageWithSize:CGSizeMake(200, 200)];
            if (image) {
              NSData *jpegData = UIImageJPEGRepresentation(image, 0.9);
              if (jpegData) {
                NSString *base64 = [jpegData base64EncodedStringWithOptions:0];
                dispatch_async(dispatch_get_main_queue(), ^{
                  resolve(base64);
                });
                return;
              }
            }
          }
          dispatch_async(dispatch_get_main_queue(), ^{
            resolve([NSNull null]);
          });
          return;
        }
      }

      dispatch_async(dispatch_get_main_queue(), ^{
        resolve([NSNull null]);
      });
    } @catch (NSException *e) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"ARTWORK_ERROR", [e reason], nil);
      });
    }
  });
}

@end
