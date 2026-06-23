#import <React/RCTBridgeModule.h>
#import <MediaPlayer/MediaPlayer.h>

@interface MusicLibraryModule : NSObject <RCTBridgeModule>
@end

@implementation MusicLibraryModule

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup { return NO; }

// Returns base64 JPEG artwork for a single track by its persistentID string ("mplib::<id>")
RCT_EXPORT_METHOD(getArtwork:(NSString *)trackId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    unsigned long long pid = 0;
    NSString *stripped = [trackId stringByReplacingOccurrencesOfString:@"mplib::" withString:@""];
    pid = strtoull([stripped UTF8String], NULL, 10);
    if (!pid) { resolve(nil); return; }

    MPMediaPropertyPredicate *pred = [MPMediaPropertyPredicate
      predicateWithValue:@(pid) forProperty:MPMediaItemPropertyPersistentID];
    MPMediaQuery *q = [[MPMediaQuery alloc] init];
    [q addFilterPredicate:pred];
    MPMediaItem *item = [q items].firstObject;
    if (!item) { resolve(nil); return; }

    MPMediaItemArtwork *art = [item valueForProperty:MPMediaItemPropertyArtwork];
    if (!art) { resolve(nil); return; }
    UIImage *img = [art imageWithSize:CGSizeMake(300, 300)];
    if (!img) { resolve(nil); return; }
    NSData *data = UIImageJPEGRepresentation(img, 0.75f);
    dispatch_async(dispatch_get_main_queue(), ^{
      resolve(data ? [data base64EncodedStringWithOptions:0] : nil);
    });
  });
}

RCT_EXPORT_METHOD(requestPermission:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [MPMediaLibrary requestAuthorization:^(MPMediaLibraryAuthorizationStatus status) {
    resolve(@(status == MPMediaLibraryAuthorizationStatusAuthorized));
  }];
}

RCT_EXPORT_METHOD(getTracks:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  if ([MPMediaLibrary authorizationStatus] != MPMediaLibraryAuthorizationStatusAuthorized) {
    resolve(@[]);
    return;
  }

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    MPMediaQuery *query = [MPMediaQuery songsQuery];
    NSArray<MPMediaItem *> *items = [query items] ?: @[];
    NSMutableArray *tracks = [NSMutableArray arrayWithCapacity:items.count];

    for (MPMediaItem *item in items) {
      NSURL *assetURL = [item valueForProperty:MPMediaItemPropertyAssetURL];
      if (!assetURL) continue;

      NSDictionary *t = @{
        @"id":       [NSString stringWithFormat:@"mplib::%llu", item.persistentID],
        @"title":    ([item valueForProperty:MPMediaItemPropertyTitle]      ?: @"Unknown"),
        @"artist":   ([item valueForProperty:MPMediaItemPropertyArtist]     ?: @"Unknown Artist"),
        @"album":    ([item valueForProperty:MPMediaItemPropertyAlbumTitle] ?: @"Unknown Album"),
        @"duration": @(item.playbackDuration),
        @"uri":      assetURL.absoluteString,
      };
      [tracks addObject:t];
    }

    dispatch_async(dispatch_get_main_queue(), ^{ resolve(tracks); });
  });
}

@end
